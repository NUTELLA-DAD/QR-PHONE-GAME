// OFF-SCREEN PORTHOLES and the LOOKOUT'S SPYGLASS gate: the real host in headless Chrome (tools/shot3d.mjs). Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally).
//   node tools/portholes-check.mjs [--port N] [--shots DIR] [--prefix portholes_] [--only plan,friend,spy,dark,twod,low,versus]
// Every run must print 0 console errors. The simulation is frozen between steps (window.game.update is a no-op) and advanced by hand. Checks:
//   plan    (the planner alone, in the page) budgets by tier (3 / 2 / 0), a plane that hovers at the screen edge never flickers (hysteresis), a sweep out and back appears and goes once, planes close
//           together share one porthole "x3", an on-screen plane gets none, a plane to the right gets a porthole on the right edge with the pointer notch pointing right, never in the HUD's top band
//   friend  (3D, Medium) a friendly escort flown off screen gets a green-rimmed porthole in the right edge direction, drawn live by the 3D view; an ENEMY fighter off screen gets none (only its arrow)
//   spy     (3D, Medium) a manned lookout shows the spyglass (live in 3D), a bot lookout pans toward a threat ahead and spots it, the stick pans a human's (smooth: never past its goal, inside its range,
//           up / down too), a target in the lens for SEEN_T is spotted (and not before), one outside it is not, an empty nest hides it
//   dark    (the Storm Front, DARK 0.72) an unlit target in the spyglass is NOT seen; lit by a searchlight it is
//   twod    (2D view) the same two things, drawn by the 2D renderer
//   low     (3D, tier low) no edge portholes (the arrows stay), the spyglass is drawn by the 2D renderer
//   versus  Versus: no spyglass, no edge portholes, 0 errors
// Screenshots (with --shots DIR): portholes_friend, portholes_cluster, portholes_gunship_arrow (an enemy gets only its arrow), portholes_spy, portholes_spy_panned, portholes_spy_dark, portholes_2d, portholes_low ...
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const has = (k) => argv.includes('--' + k);
const port = Number(arg('port', 5000 + Math.floor(Math.random() * 500)));
const shotDir = arg('shots', ''), prefix = arg('prefix', 'portholes_');
const only = (arg('only', '') || '').split(',').filter(Boolean);
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'portholes-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const fail = (m) => { failed++; console.log('  FAIL ' + m); };
const want = (n) => !only.length || only.includes(n);

const server = spawn(process.execPath, ['server.js'], { cwd: here, env: { ...process.env, PORT: String(port) }, stdio: has('verbose') ? 'inherit' : 'ignore' });
let up = false;
for (let i = 0; i < 40 && !up; i++) { try { up = (await fetch(`http://localhost:${port}/host.html`)).ok; } catch { await sleep(250); } }
if (!up) { console.log('the server did not start on port ' + port); server.kill(); process.exit(2); }

const sl = 'const sl=(ms)=>new Promise(r=>setTimeout(r,ms));';
// ---- page-side helpers ----------------------------------------------------------------------------------------------------------------------------------------------------------
const PRE = `
window.__P = {
  st: () => window.game.state,
  sh: () => window.game.state.ships[0],
  V: () => (window.view3dDebug ? window.view3dDebug().view : null),
  frame: () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1)))),
  items: () => (window.portholesDebug && window.portholesDebug.plan ? window.portholesDebug.plan.items : []).map((i) => ({ id: i.id, kind: i.kind, x: Math.round(i.x), y: Math.round(i.y), r: i.r, a: i.a, pic: i.pic, count: i.count, sub: i.sub, label: i.label, ang: +i.ang.toFixed(3), leaving: !!i.leaving, marks: i.marks ? i.marks.length : 0 })),
  live: () => { const v = window.__P.V(); return v && v.portholesLive ? [...v.portholesLive] : []; },
  escort(i, dx, dy) { const st = this.st(), sh = this.sh(); st.escorts = st.escorts || []; while (st.escorts.length <= i) st.escorts.push({ name: 'Escort ' + (st.escorts.length + 1), flying: true, docked: false, x: 0, y: 0, vx: 0, vy: 0, heading: 0, hp: 3, max: 3, trail: [], fake: true }); const e = st.escorts[i]; e.flying = true; e.docked = false; e.x = sh.pose.x + dx; e.y = sh.pose.y + dy; e.heading = dx < 0 ? Math.PI : 0; return e; },
  noEscorts() { const st = this.st(); st.escorts = (st.escorts || []).filter((e) => !e.fake); for (const e of st.escorts) e.flying = false; st.escort = st.escorts[0]; },
  enemyAt(x, y) { const e = this.st().enemy; e.dead = 0; e.x = x; e.y = y; e.vx = 0; e.vy = 0; return e; },
  async waitFor(pred, ms = 8000) { const t0 = performance.now(); while (!pred() && performance.now() - t0 < ms) await this.frame(); return pred(); }, // (wait on what the check is about, drawn frames, not a fixed time: a busy machine draws fewer of them)
  async untilSpy(max = 6000) { const st = this.st(); let n = 0; while (!(st.spy && st.spy.on) && n < max) { window.__step(30); n += 30; } return n; },
};
`;
const boot = (steps = 300, seed = 7) => `(async()=>{ ${sl} ${PRE}
  window.__cfg = (await import('/config.js')).config;
  let sd=${seed}; Math.random=()=>{ sd=(sd+0x6D2B79F5)|0; let t=Math.imul(sd^(sd>>>15),1|sd); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
  const g=window.game; window.__upd=g.update.bind(g); window.__step=(n)=>{ for(let i=0;i<n;i++) window.__upd(1/60); };
  const B=document.getElementById('bots'); B.click(); B.click(); await sl(300); document.getElementById('castoff').click(); g.update=()=>{}; window.__step(${steps}); await sl(300); window.__r={}; return 1; })()`;
const RESULT = 'JSON.stringify(window.__r||null)';

function run(name, view, query, steps) {
  const file = path.join(out, name + '.json');
  fs.writeFileSync(file, JSON.stringify(steps));
  const args = [path.join(here, 'tools/shot3d.mjs'), '--url', `http://localhost:${port}/host.html?view=${view}&${query}`, '--out', path.join(shotDir || out, (shotDir ? prefix.replace(/_$/, '') : 'shot') + '.png'), '--gl', 'default', '--wait', '1500', '--ready', 'window.__meter!==undefined', '--evals-file', file, '--size', '1600x900', '--stats-js', RESULT];
  const r = spawnSync(process.execPath, args, { cwd: here, encoding: 'utf8', timeout: 420000 });
  const text = (r.stdout || '') + (r.stderr || '');
  const errs = Number((/console errors: (\d+)/.exec(text) || [])[1] ?? NaN);
  const m = /stats-js (".*")/.exec(text);
  let data = null;
  try { data = m ? JSON.parse(JSON.parse(m[1])) : null; } catch { data = null; }
  const evalErrors = (text.match(/EVAL ERROR/g) || []).length;
  if (has('verbose') || evalErrors || errs) console.log(text.split('\n').filter((l) => /EVAL ERROR|\[page\] (error|EXC)|EXCEPTION/.test(l)).join('\n'));
  return { text, errs, data, evalErrors };
}
const shotName = (n) => (shotDir ? n : null);
const clean = (name, r) => { if (r.errs !== 0 || r.evalErrors) fail(name + ': console / eval errors (' + r.errs + ' / ' + r.evalErrors + ')'); if (!r.data) fail(name + ': no result'); };
const f2 = (n) => (typeof n === 'number' ? +n.toFixed(3) : n);
const show = (name, d) => console.log('  ' + name + ': ' + JSON.stringify(d, (k, v) => (typeof v === 'number' ? f2(v) : v)).slice(0, 900));
const step = (js, ms = 100, shot) => [js, ms, shot ? shotName(shot) : undefined].filter((v, i) => i < 2 || v !== undefined);

try {
  // ---- 1. the planner alone ---------------------------------------------------------------------------------------------------------------------------------------------------
  if (want('plan')) {
    console.log('1. the planner: budgets, hysteresis, clusters, edge placement');
    const test = `(async()=>{ ${sl} const P=window.__P, st=P.st(), sh=P.sh();
      const M=await import('/modules/host/portholes.js'); const W=1600, H=900;
      const view=()=>({ cx: sh.pose.x+800, cy: sh.pose.y, zoom: 0.5 });
      const mk=()=>M.createPortholes({ state: st });
      const run=(pl, tier, n=40, v=view())=>{ let r=null; for(let i=0;i<n;i++) r=pl.plan({ view: v, w: W, h: H, dt: 1/60, tier, mode3d: true }); return r; };
      const v0=view(), sx=(x)=>W/2+(x-v0.cx)*v0.zoom, worldX=(sxp)=>v0.cx+(sxp-W/2)/v0.zoom;
      P.noEscorts(); st.phase='flying'; st.vote=null; st.scorecard=null; st.runEnd=null;
      const R={};
      // budgets: three far-apart escorts
      const place3=()=>{ P.escort(0, 5200, 0); P.escort(1, -5200, 200); P.escort(2, 800, -4200); };
      place3();
      R.budget={ high: run(mk(),'high').items.filter(i=>i.kind==='edge').length, medium: run(mk(),'medium').items.filter(i=>i.kind==='edge').length, low: run(mk(),'low').items.filter(i=>i.kind==='edge').length };
      // placement: the escort to the right
      P.noEscorts(); P.escort(0, 5200, 0);
      { const it=run(mk(),'medium').items.find(i=>i.kind==='edge'); R.right= it ? { x:it.x, y:it.y, ang:it.ang, r:it.r, top:it.y-it.r, label:it.label, ring:it.ring, count:it.count } : null; }
      // an on-screen plane gets none
      P.noEscorts(); P.escort(0, 300, -100);
      R.onscreen=run(mk(),'medium').items.filter(i=>i.kind==='edge').length;
      // a cluster of three
      P.noEscorts(); P.escort(0, -5200, 0); P.escort(1, -5000, 150); P.escort(2, -5350, -120);
      { const its=run(mk(),'high').items.filter(i=>i.kind==='edge'); R.cluster={ n: its.length, count: its[0]&&its[0].count, sub: its[0]&&its[0].sub }; }
      // hysteresis: one escort sweeps across the right edge and back, then hovers on the threshold
      P.noEscorts(); const e=P.escort(0, 0, 0);
      const pl=mk(); const present=(r)=>r.items.some(i=>i.kind==='edge'&&!i.leaving);
      const at=(sxp)=>{ e.x=worldX(sxp); e.y=sh.pose.y; return present(pl.plan({ view: v0, w: W, h: H, dt: 1/60, tier: 'medium', mode3d: true })); };
      let last=false, toggles=0, sweep=[]; for(let s=W-80; s<=W+160; s+=2){ const p=at(s); if(p!==last){ toggles++; sweep.push(['on',s]); } last=p; }
      for(let s=W+160; s>=W-80; s-=2){ const p=at(s); if(p!==last){ toggles++; sweep.push(['off',s]); } last=p; }
      R.sweep={ toggles, events: sweep };
      const pl2=mk(); let t2=0, l2=false; for(let k=0;k<200;k++){ e.x=worldX(W+ (k%2? 70: 82)); const p=present(pl2.plan({ view: v0, w: W, h: H, dt: 1/60, tier: 'medium', mode3d: true })); if(p!==l2) t2++; l2=p; }
      R.hover={ toggles: t2 };
      P.noEscorts();
      window.__r.plan=R; return 1; })()`;
    const r = run('plan', '3d', 'tier=medium&kind=open&env=skyisles', [step(boot(300), 300), step(test, 100)]);
    clean('plan', r); show('plan', r.data);
    const d = r.data && r.data.plan;
    if (d) {
      if (d.budget.high !== 3 || d.budget.medium !== 2 || d.budget.low !== 0) fail('plan: the budgets are ' + JSON.stringify(d.budget) + ' (wanted 3 / 2 / 0)');
      if (!d.right) fail('plan: an escort far to the right got no porthole');
      else {
        if (!(d.right.x > 800 && Math.abs(d.right.ang) < 0.7)) fail('plan: the porthole for an escort on the right is not on the right edge, notch right ' + JSON.stringify(d.right));
        if (!(d.right.top >= 0.29 * 900)) fail('plan: the porthole reaches into the HUD band at the top ' + JSON.stringify(d.right));
        if (d.right.ring !== 'friend') fail('plan: a friend\'s ring is ' + d.right.ring);
      }
      if (d.onscreen !== 0) fail('plan: an on-screen plane got a porthole');
      if (!(d.cluster.n === 1 && d.cluster.count === 3)) fail('plan: three planes together should be ONE porthole "x3" ' + JSON.stringify(d.cluster));
      if (d.sweep.toggles !== 2) fail('plan: a sweep out and back should appear once and go once, got ' + JSON.stringify(d.sweep));
      if (d.hover.toggles > 1) fail('plan: a plane hovering at the threshold flickered ' + d.hover.toggles + ' times');
    }
  }

  // ---- 2. a friend off screen, an enemy off screen ---------------------------------------------------------------------------------------------------------------------------
  if (want('friend')) {
    console.log('2. 3D Medium: a friendly escort off screen gets a porthole, an enemy fighter gets only its arrow');
    const t1 = `(async()=>{ ${sl} const P=window.__P, st=P.st(), sh=P.sh(); P.noEscorts(); P.escort(0, 6200, -300); await sl(1200); await P.frame();
      window.__r.friend={ items: P.items(), live: P.live(), stats: P.V().stats().portholes }; return 1; })()`;
    const t2 = `(async()=>{ ${sl} const P=window.__P, st=P.st(), sh=P.sh(); P.noEscorts(); P.escort(0, -5200, -500); P.escort(1, -5000, -250); P.escort(2, -5400, -380); await sl(1200); await P.frame();
      window.__r.cluster={ items: P.items(), live: P.live() }; return 1; })()`;
    const t3 = `(async()=>{ ${sl} const P=window.__P, st=P.st(), sh=P.sh(); P.noEscorts(); P.enemyAt(sh.pose.x+6500, sh.pose.y-300); window.__step(1); await sl(1200); await P.frame();
      window.__r.enemy={ items: P.items(), spotted: st.enemy.spotT>0 }; return 1; })()`;
    const t4 = `(async()=>{ ${sl} const P=window.__P, st=P.st(), sh=P.sh(); P.escort(0, 6200, -300); P.escort(1, -5200, 100); P.enemyAt(sh.pose.x+8000, sh.pose.y); await sl(1200); await P.frame(); window.__r.both={ items: P.items(), live: P.live() }; return 1; })()`;
    const r = run('friend', '3d', 'tier=medium&kind=open&env=skyisles', [step(boot(300), 300), step(t1, 300, 'friend'), step(t2, 300, 'cluster'), step(t3, 300, 'enemy_arrow_only'), step(t4, 300, 'friend_and_enemy')]);
    clean('friend', r); show('friend', r.data);
    const d = r.data || {};
    if (d.friend) {
      const e = d.friend.items.find((i) => i.kind === 'edge');
      if (!e) fail('friend: an escort flown off screen to the right got no porthole');
      else {
        if (!(e.x > 800 && Math.abs(e.ang) < 0.7)) fail('friend: the porthole is not on the right edge / the notch is not pointing right ' + JSON.stringify(e));
        if (e.pic !== '3d' || !d.friend.live.includes(e.id)) fail('friend: the picture was not drawn live by the 3D view ' + JSON.stringify(d.friend.live));
        if (e.a !== 1) fail('friend: it has not faded in (a = ' + e.a + ')');
      }
      if (d.friend.stats && d.friend.stats.error) fail('friend: the 3D portholes reported ' + d.friend.stats.error);
    }
    if (d.cluster) {
      const edges = d.cluster.items.filter((i) => i.kind === 'edge');
      if (!(edges.length === 1 && edges[0].count === 3 && edges[0].x < 800)) fail('cluster: three escorts on the left should be one "x3" porthole on the left ' + JSON.stringify(edges));
    }
    if (d.enemy) {
      if (d.enemy.items.some((i) => i.kind === 'edge')) fail('enemy: an enemy fighter off screen got an edge porthole ' + JSON.stringify(d.enemy.items));
    }
    if (d.both && d.both.items.filter((i) => i.kind === 'edge').length !== 2) fail('both: two friends and one enemy should give exactly two portholes ' + JSON.stringify(d.both.items));
  }

  // ---- 3. the spyglass ----------------------------------------------------------------------------------------------------------------------------------------------------------
  if (want('spy')) {
    console.log('3. 3D Medium: the lookout\'s spyglass: shown, panned, spotting');
    // (Where the spyglass STARTS is read at the step the lookout takes the nest: a bot lookout pans toward the nearest threat ahead at once, and with the set pieces of today's game one is usually
    // about, so two seconds later it was 4000 px out, not where it started. "pan: up" allows for the top of the map: the lens is kept inside it, so a ship flying high cannot look 1000 px up.)
    const t1 = `(async()=>{ ${sl} const P=window.__P, st=P.st(), sh=P.sh(), C=window.__cfg.SPYGLASS; let n=0; while(!(st.spy && st.spy.on) && n<6000){ window.__step(1); n++; } const start=st.spy.fwd; window.__step(120); await sl(1200); await P.frame(); const S=st.spy;
      window.__r.on={ n, on:S.on, bot:S.bot, who:S.who, fwd:start, fwdNow:S.fwd, ahead:C.AHEAD, items:P.items(), live:P.live(), stats:P.V().stats().portholes, W:document.getElementById('c').width }; return 1; })()`;
    const tbot = `(async()=>{ ${sl} const P=window.__P, st=P.st(), sh=P.sh(), S=st.spy; let e=null, near=1e9, got=false; for(let i=0;i<420;i++){ e=P.enemyAt(sh.pose.x+8200, sh.pose.y-400); window.__step(1); near=Math.min(near, Math.hypot(S.cx-e.x, S.cy-e.y)); if(e.spotT>0) got=true; }
      await sl(500); window.__r.botPan={ bot:S.bot, dist:near, spotted:got }; return 1; })()`;
    const tpan = `(async()=>{ ${sl} const P=window.__P, st=P.st(), sh=P.sh(), S=st.spy, C=window.__cfg.SPYGLASS; const p=st.players[S.who]; p.bot=false; st.enemy.dead=9; const R={};
      const f=S.f; let prev=S.fwd, mono=true, over=false, max=-1e9, min=1e9;
      for(let i=0;i<150;i++){ p.jxs=1; p.jy=0; window.__step(1); if(S.fwd<prev-1e-6) mono=false; if(S.fwd>S.tfwd+1e-6) over=true; prev=S.fwd; max=Math.max(max,S.fwd); }
      p.jxs=0; for(let i=0;i<120;i++){ window.__step(1); if(S.fwd>S.tfwd+1e-6) over=true; max=Math.max(max,S.fwd); }
      R.right={ f, fwd:S.fwd, tfwd:S.tfwd, mono, over, max, limit:C.AHEAD_MAX };
      let moved0=S.fwd; for(let i=0;i<20;i++){ window.__step(1); } R.rest={ drift: Math.abs(S.fwd-moved0) };
      for(let i=0;i<420;i++){ p.jxs=-1; window.__step(1); min=Math.min(min,S.fwd); if(S.fwd<S.tfwd-1e-6) over=true; }
      p.jxs=0; for(let i=0;i<120;i++){ window.__step(1); min=Math.min(min,S.fwd); }
      R.left={ fwd:S.fwd, min, limit:-C.BEHIND, over };
      const up0=S.up; for(let i=0;i<150;i++){ p.jxs=0; p.jy=-1; window.__step(1); } R.up={ from:up0, to:S.up, limit:C.UP, room:S.my };
      for(let i=0;i<300;i++){ p.jy=1; window.__step(1); } R.down={ to:S.up, limit:-C.DOWN };
      p.jy=0; p.jxs=1; for(let i=0;i<150;i++){ window.__step(1); } p.jxs=0; for(let i=0;i<150;i++){ window.__step(1); }
      p.jy=-0.4; for(let i=0;i<150;i++){ p.jy=0; p.jxs=0; window.__step(1); } // back toward the middle of the sky for the picture
      S.tfwd=C.AHEAD; S.tup=0.0; for(let i=0;i<200;i++) window.__step(1); R.recentre={ fwd:S.fwd, up:S.up };
      window.__r.pan=R; return 1; })()`;
    const tshot = `(async()=>{ ${sl} const P=window.__P, st=P.st(), sh=P.sh(), S=st.spy, p=st.players[S.who]; S.tfwd=9500; S.tup=900; for(let i=0;i<150;i++) window.__step(1); let e=null; for(let i=0;i<100;i++){ e=P.enemyAt(S.cx+250, S.cy-60); window.__step(1); } await sl(900); await P.frame(); window.__r.shot={ fwd:S.fwd, up:S.up, spotted:e.spotT>0 }; return 1; })()`;
    const tspot = `(async()=>{ ${sl} const P=window.__P, st=P.st(), sh=P.sh(), S=st.spy, p=st.players[S.who]; const R={};
      S.tfwd=7000; S.tup=0; for(let i=0;i<200;i++){ P.enemyAt(S.cx+9000, S.cy); window.__step(1); } st.spots.length=0; let e=P.enemyAt(S.cx, S.cy); e.spotT=0; p.spotRecent=0;
      for(let i=0;i<20;i++){ P.enemyAt(S.cx+150, S.cy+50); window.__step(1); } R.early={ spotted:e.spotT>0, t:20/60 };
      for(let i=0;i<50;i++){ P.enemyAt(S.cx+150, S.cy+50); window.__step(1); } R.late={ spotted:e.spotT>0, listed: st.spots.some(s=>s.obj===e), recent:p.spotRecent>0, spotT:e.spotT };
      for(let i=0;i<700;i++){ P.enemyAt(S.cx+150, S.cy+50); window.__step(1); } R.kept={ spotted:e.spotT>0 };
      st.spots.length=0; e.spotT=0; for(let i=0;i<120;i++){ e=P.enemyAt(S.cx+5200, S.cy); window.__step(1); } R.outside={ spotted:e.spotT>0 };
      window.__r.spot=R; return 1; })()`;
    const tgone = `(async()=>{ ${sl} const P=window.__P, st=P.st(), S=st.spy, p=st.players[S.who]; p.lock=null; window.__step(5); const off=!S.on; await sl(1400); await P.frame(); window.__r.gone={ off, items:P.items(), live:P.live() }; return 1; })()`;
    const r = run('spy', '3d', 'tier=medium&kind=open&env=skyisles', [step(boot(300), 300), step(t1, 300, 'spy'), step(tbot, 200, 'spy_bot_pans'), step(tpan, 200), step(tshot, 300, 'spy_panned'), step(tspot, 100), step(tgone, 100)]);
    clean('spy', r); show('spy', r.data);
    const d = r.data || {};
    if (d.on) {
      const s = d.on.items.find((i) => i.kind === 'spy');
      if (!d.on.on || !s) fail('spy: a manned lookout did not show the spyglass ' + JSON.stringify(d.on));
      else {
        if (!(s.pic === '3d' && d.on.live.includes('spy'))) fail('spy: the spyglass was not drawn live in 3D');
        if (s.a !== 1) fail('spy: it has not faded in');
        if (!(s.y - s.r >= 0 && s.x - s.r > 0.3 * 1600 && s.x + s.r < 0.78 * 1600)) fail('spy: it is not at the top, clear of the HUD panels ' + JSON.stringify(s));
        if (Math.abs(d.on.fwd - d.on.ahead) > 400) fail('spy: it does not start ' + d.on.ahead + ' px ahead (' + d.on.fwd + ')');
      }
      if (d.on.stats && d.on.stats.error) fail('spy: the 3D portholes reported ' + d.on.stats.error);
    }
    if (d.botPan) {
      if (!d.botPan.bot) fail('spy: this lookout was expected to be a bot');
      else if (!(d.botPan.dist < 700)) fail('spy: the bot lookout did not pan toward the threat ahead (' + Math.round(d.botPan.dist) + ' px off)');
      else if (!d.botPan.spotted) fail('spy: the bot lookout did not spot it');
    }
    if (d.pan) {
      const P = d.pan;
      if (!(P.right.fwd > 11000 && P.right.mono && !P.right.over)) fail('pan: right: the spyglass did not glide smoothly out (fwd ' + P.right.fwd + ', monotone ' + P.right.mono + ', over ' + P.right.over + ')');
      if (!(P.right.max <= P.right.limit + 1)) fail('pan: it went past its range ahead (' + P.right.max + ' of ' + P.right.limit + ')');
      if (!(P.left.min >= P.left.limit - 1 && P.left.fwd <= -1500 && !P.left.over)) fail('pan: left: ' + JSON.stringify(P.left));
      if (!((P.up.to > P.up.from + 1000 || P.up.to >= P.up.room - 5) && P.up.to <= P.up.limit + 1)) fail('pan: up: ' + JSON.stringify(P.up));
      if (!(P.down.to < 0 && P.down.to >= P.down.limit - 1)) fail('pan: down: ' + JSON.stringify(P.down));
      if (!(Math.abs(P.recentre.fwd - 7000) < 5)) fail('pan: it did not settle on its goal ' + JSON.stringify(P.recentre));
    }
    if (d.spot) {
      if (d.spot.early.spotted) fail('spot: spotted before SEEN_T (' + d.spot.early.t + ' s)');
      if (!(d.spot.late.spotted && d.spot.late.listed && d.spot.late.recent)) fail('spot: a target held in the lens was not spotted (marked, listed, helm bonus) ' + JSON.stringify(d.spot.late));
      if (!d.spot.kept.spotted) fail('spot: the mark is not kept while it is still watched');
      if (d.spot.outside.spotted) fail('spot: a target outside the lens was spotted');
    }
    if (d.gone) {
      if (!d.gone.off) fail('gone: an empty nest still shows the spyglass');
      if (d.gone.items.some((i) => i.kind === 'spy')) fail('gone: the spyglass has not faded away');
    }
  }

  // ---- 4. dark sky ------------------------------------------------------------------------------------------------------------------------------------------------------------------
  if (want('dark')) {
    console.log('4. the Storm Front (dark): the spyglass sees only what is lit');
    const t = `(async()=>{ ${sl} const P=window.__P, st=P.st(), sh=P.sh(); await P.untilSpy(); window.__step(120); const S=st.spy, p=st.players[S.who]; p.bot=false; S.tfwd=7000; S.tup=0; for(let i=0;i<200;i++) window.__step(1); const R={ dark: st.darkNow };
      st.spots.length=0; let e=P.enemyAt(S.cx, S.cy); e.spotT=0; for(let i=0;i<90;i++){ e=P.enemyAt(S.cx+100, S.cy+40); e.lit=0; window.__step(1); } await sl(500); await P.frame(); await P.frame(); R.unlit={ spotted:e.spotT>0, marks: (P.items().find(i=>i.kind==='spy')||{}).marks };
      for(let i=0;i<90;i++){ e=P.enemyAt(S.cx+100, S.cy+40); e.lit=3; window.__step(1); } R.lit={ spotted:e.spotT>0 }; await sl(900); await P.frame(); window.__r.dark=R; return 1; })()`;
    const r = run('dark', '3d', 'tier=medium&kind=open&env=storm', [step(boot(300), 300), step(t, 300, 'spy_dark')]);
    clean('dark', r); show('dark', r.data);
    const d = r.data && r.data.dark;
    if (d) {
      if (!(d.dark > 0.45)) fail('dark: the Storm Front is not dark (' + d.dark + ')');
      if (d.unlit.spotted || d.unlit.marks) fail('dark: an unlit target was seen in the spyglass ' + JSON.stringify(d.unlit));
      if (!d.lit.spotted) fail('dark: a lit target was not seen');
    }
  }

  // ---- 5. 2D, Low, Versus ------------------------------------------------------------------------------------------------------------------------------------------------------------
  if (want('twod')) {
    console.log('5. the 2D view');
    const t = `(async()=>{ ${sl} const P=window.__P, st=P.st(), sh=P.sh(); await P.untilSpy(); window.__step(120); await P.untilSpy(); P.escort(0, -5200, -200); await sl(400); await P.waitFor(() => P.items().some((i) => i.kind === 'spy' && i.pic === '2d') && P.items().some((i) => i.kind === 'edge' && i.pic === '2d')); await P.frame(); window.__r.twod={ items:P.items() }; return 1; })()`;
    const r = run('twod', '2d', 'kind=open&env=skyisles', [step(boot(300), 300), step(t, 400, '2d')]);
    clean('twod', r); show('twod', r.data);
    const it = (r.data && r.data.twod && r.data.twod.items) || [];
    if (!it.some((i) => i.kind === 'edge' && i.pic === '2d' && i.x < 800)) fail('twod: no 2D porthole for the escort on the left ' + JSON.stringify(it));
    if (!it.some((i) => i.kind === 'spy' && i.pic === '2d')) fail('twod: no spyglass in the 2D view ' + JSON.stringify(it));
  }
  if (want('low')) {
    console.log('6. 3D, tier Low: the arrows stay, the spyglass is drawn in 2D');
    const t = `(async()=>{ ${sl} const P=window.__P, st=P.st(), sh=P.sh(); await P.untilSpy(); window.__step(120); await P.untilSpy(); P.escort(0, 6200, -300); await sl(400); await P.waitFor(() => P.items().some((i) => i.kind === 'spy')); await sl(600); await P.frame(); window.__r.low={ items:P.items(), live:P.live() }; return 1; })()`;
    const r = run('low', '3d', 'tier=low&kind=open&env=skyisles', [step(boot(300), 300), step(t, 400, 'low')]);
    clean('low', r); show('low', r.data);
    const d = r.data && r.data.low;
    if (d) {
      if (d.items.some((i) => i.kind === 'edge')) fail('low: Low drew an edge porthole (its budget is 0: it keeps the arrows)');
      if (!d.items.some((i) => i.kind === 'spy' && i.pic === '2d') || d.live.length) fail('low: the spyglass should be a 2D one ' + JSON.stringify(d));
    }
  }
  if (want('versus')) {
    console.log('7. Versus: no spyglass, no edge portholes, no errors');
    const t = `(async()=>{ ${sl} ${PRE} const g=window.game; window.__upd=g.update.bind(g); window.__step=(n)=>{ for(let i=0;i<n;i++) window.__upd(1/60); }; await sl(800); g.update=()=>{}; window.__step(300); await sl(1500); window.__r={ ships:g.state.ships.length, items:window.__P.items(), spy:g.state.spy&&g.state.spy.on }; return 1; })()`;
    const r = run('versus', '3d', 'versus=1&bots=4&tier=medium', [step(t, 300, 'versus')]);
    clean('versus', r); show('versus', r.data);
    if (r.data && (r.data.items.length || r.data.spy)) fail('versus: portholes appeared ' + JSON.stringify(r.data.items));
  }

  // ---- 7b. the escorts of every ship, docked and flying ------------------------------------------------------------------------------------------------------------------------------
  if (want('escorts')) {
    console.log("7b. escorts: docked ones sit on their hooks in 3D (a ghost while rebuilt); every ship's escorts are drawn; portholes for the main ship's team");
    const bootClassic = boot(300).replace('const g=window.game;', "const g=window.game; g.setStartBuild('classic'); await sl(300);");
    const tdock = `(async()=>{ ${sl} const P=window.__P, st=P.st(), V=P.V(); await sl(800); await P.frame(); const list=st.escorts||[]; const a=V.flyers.stats(); const R={ escorts:list.length, docked:a.docked, ghosts:a.ghosts, friends:a.friends };
      if(list.length){ list[0].rebuild=6; await sl(600); await P.frame(); const b=V.flyers.stats(); R.ghost={ docked:b.docked, ghosts:b.ghosts }; list[0].rebuild=0; await sl(500); await P.frame(); }
      window.__r.docked=R; return 1; })()`;
    const r1 = run('docked', '3d', 'tier=medium&kind=open&env=skyisles', [step(bootClassic, 300), step(tdock, 300, 'docked')]);
    clean('docked', r1); show('docked', r1.data);
    const dd = r1.data && r1.data.docked;
    if (dd) {
      if (!(dd.escorts >= 1 && dd.docked === dd.escorts && dd.ghosts === 0)) fail('docked: the docked escorts are not all drawn on their hooks ' + JSON.stringify(dd));
      if (dd.ghost && !(dd.ghost.ghosts === 1 && dd.ghost.docked === dd.escorts - 1)) fail('docked: a plane being rebuilt should be one ghost ' + JSON.stringify(dd.ghost));
    }
    const tver = `(async()=>{ ${sl} ${PRE} window.__r={}; const g=window.game; window.__upd=g.update.bind(g); window.__step=(n)=>{ for(let i=0;i<n;i++) window.__upd(1/60); }; await sl(800); g.update=()=>{}; window.__step(200); await sl(800);
      const P=window.__P, st=P.st(), V=P.V(); const ships=st.ships.filter(s=>!s.ai); let total=0; const own=[];
      ships.forEach((sh,si)=>{ const list=(sh.ctx&&sh.ctx.escorts)||[]; list.forEach((e,i)=>{ e.docked=false; e.flying=true; e.returning=false; e.x=sh.pose.x+500+i*320; e.y=sh.pose.y-500-i*80; e.heading=0; e.trail=[]; total++; }); own.push(list.length); });
      await sl(1500); await P.frame(); const a=V.flyers.stats();
      const main=ships[0], other=ships[1]; const em=(main.ctx.escorts||[])[0], eo=((other&&other.ctx.escorts)||[])[0];
      if(em){ em.y=main.pose.y-4300; } if(eo){ eo.y=other.pose.y-4300; } await sl(1500); await P.frame();
      window.__r.versus={ phase:st.phase, zoom:window.__lastView.zoom, cx:window.__lastView.cx, mx:main.pose.x, ships:ships.length, teams:ships.map(s=>s.team&&s.team.id), own, total, friends:a.friends, items:P.items().filter(i=>i.kind==='edge').map(i=>({x:i.x,count:i.count})) }; return 1; })()`;
    const r2 = run('versus_escorts', '3d', 'versus=1&bots=4&tier=medium', [step(tver, 300, 'versus_escorts')]);
    clean('versus escorts', r2); show('versus escorts', r2.data);
    const v = r2.data && r2.data.versus;
    if (v) {
      if (!(v.total >= 2 && v.own.length === 2 && v.own.every((n) => n >= 1))) fail('versus escorts: each ship should have escorts ' + JSON.stringify(v));
      else if (v.friends !== v.total) fail('versus escorts: ' + v.friends + ' of ' + v.total + " escorts are drawn (every ship's planes must be)");
      if (!v.items.length) fail("versus escorts: the main ship's own escort off screen got no porthole");
      if (v.items.length > 1) fail("versus escorts: a porthole for the other team plane " + JSON.stringify(v.items));
    }
  }

  // ---- 8. cost ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
  if (want('perf')) {
    console.log('8. cost: three edge portholes + the spyglass at High, two + the spyglass at Medium');
    for (const tier of ['high', 'medium']) {
      const t = `(async()=>{ ${sl} const P=window.__P, st=P.st(), sh=P.sh(); await P.untilSpy(); window.__step(120); P.escort(0, 5200, -200); P.escort(1, -5200, 200); P.escort(2, 800, -4200); await sl(1500);
        const ms=[], calls=[], tris=[], n=[]; const V=P.V(); for(let i=0;i<40;i++){ await sl(60); const s=V.stats(); if(s.portholes&&s.portholes.n){ ms.push(s.portholes.ms); calls.push(s.portholes.calls); tris.push(s.portholes.tris); n.push(s.portholes.n); } } ms.sort((a,b)=>a-b);
        const s=V.stats(); window.__r.perf={ tier:s.tier, n:n.length?n[n.length-1]:0, cpuMsMedian: ms.length? ms[ms.length>>1]:null, cpuMsMax: ms.length? ms[ms.length-1]:null, calls: calls.length?calls[calls.length-1]:null, tris: tris.length?tris[tris.length-1]:null, mainCalls:s.sceneCalls, mainTris:s.sceneTris, items:P.items().map(i=>i.id) };
        const fpsOf=async()=>{ await sl(500); const a=[]; for(let i=0;i<8;i++){ await sl(400); a.push(window.__meter.fps); } a.sort((x,y)=>x-y); return a[a.length>>1]; };
        window.__r.perf.fpsOn=await fpsOf(); P.noEscorts(); const p=st.players[st.spy.who]; p.lock=null; window.__step(3); await sl(1500); window.__r.perf.fpsOff=await fpsOf(); return 1; })()`;
      const r = run('perf_' + tier, '3d', 'tier=' + tier + '&kind=open&env=skyisles', [step(boot(300), 300), step(t, 300, 'perf_' + tier)]);
      clean('perf ' + tier, r); show('perf ' + tier, r.data && r.data.perf);
      const p = r.data && r.data.perf;
      if (p && p.n !== (tier === 'high' ? 4 : 3)) fail('perf ' + tier + ': expected ' + (tier === 'high' ? 4 : 3) + ' portholes drawn, got ' + p.n);
      if (p && p.cpuMsMedian != null && p.cpuMsMedian > 6) fail('perf ' + tier + ': the portholes cost ' + p.cpuMsMedian + ' ms of CPU (budget 6)');
    }
  }
  console.log('  screenshots: ' + (shotDir || out));
} finally {
  try { server.kill(); } catch { /* (gone) */ }
  if (process.platform === 'win32') { try { spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* (gone) */ } }
}
console.log(failed ? 'FAILED: ' + failed : 'PASS portholes-check');
process.exit(failed ? 1 : 0);
