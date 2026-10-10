// CAMERA AND CINEMATICS (WP11) gate: the 3D view in a real headless Chrome (tools/shot3d.mjs). Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally).
//   node tools/cine3d-check.mjs [--port N] [--quick] [--shots DIR] [--prefix wp11_] [--only off,come,breach,kick,versus,long]
// The simulation is frozen between steps (window.game.update is a no-op) and advanced by hand, so every moment is the same. Every run must print 0 console errors. Checks:
//   off     ?cine=0 and a COME ABOUT: no cinematic ever starts, and the HUD alignment holds (the 3D projection of 35 plane points is within 1 px of the 2D camera's own mapping) every frame
//   come    a COME ABOUT with cinematics on: the dolly peaks near config.CINE3D.COME_ABOUT.AZ, never overshoots or goes negative (critically damped), never rolls, and AFTER it ends the camera is the
//           plain gameplay lens again (alignment within 1 px, cinema inactive). Frames at 0 / 25 / 50 / 75 % of the turn
//   breach  ?creature=kraken in the Sunken Sea: the breach warning pulls the camera back (mul > 1, elevation up), the zoom cap is not broken, then the Kraken's death plays the finale orbit (az near
//           FINALE.AZ), then everything is back and aligned
//   kick    a hard hit (a hitLog entry of power 5) gives a translational kick held in at most 3 steps, then nothing; a weak hit gives none. A cast off gives the rise and pull-back, then settles
//   versus  Versus with the ships far apart: the split view's porthole is drawn in 3D (Medium) with the frame on the 2D canvas, the Low tier keeps the 2D inset; the numbers of the porthole are printed
//   long    (not --quick) 8 bots in real time for 14 s with a COME ABOUT, on and off
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const has = (k) => argv.includes('--' + k);
const port = Number(arg('port', 4500 + Math.floor(Math.random() * 500)));
const quick = has('quick');
const shotDir = arg('shots', ''), prefix = arg('prefix', 'wp11_');
const only = (arg('only', '') || '').split(',').filter(Boolean);
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cine3d-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const fail = (m) => { failed++; console.log('  FAIL ' + m); };
const want = (n) => !only.length || only.includes(n);

const server = spawn(process.execPath, ['server.js'], { cwd: here, env: { ...process.env, PORT: String(port) }, stdio: has('verbose') ? 'inherit' : 'ignore' });
let up = false;
for (let i = 0; i < 40 && !up; i++) { try { up = (await fetch(`http://localhost:${port}/host.html`)).ok; } catch { await sleep(250); } }
if (!up) { console.log('the server did not start on port ' + port); server.kill(); process.exit(2); }

const sl = 'const sl=(ms)=>new Promise(r=>setTimeout(r,ms));';
const nap = (ms) => `new Promise(r=>setTimeout(()=>r(1),${ms}))`;
// ---- page-side helpers --------------------------------------------------------------------------------------------------------------------------------------------------------
const PRE = `
window.__c = {
  W: () => document.getElementById('c').width, H: () => document.getElementById('c').height,
  V: () => window.view3dDebug().view,
  frame: () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1)))), // (two frames: the camera and the 3D view have both run)
  sample() {
    const V = this.V(), cp = V.cinema.pose, m = V.camera.matrixWorld.elements;
    return { align: V.alignError(window.__lastView, this.W(), this.H()), active: cp.active, az: cp.az, elev: cp.elev, mul: cp.mul, kick: cp.kickPx, why: cp.why, roll: Math.abs(m[1]), zoom: window.__lastView.zoom, minZoom: window.__lastView.minZoom };
  },
  // start a COME ABOUT the way the sim's own start() does (the sim is frozen: fly() then runs it as the game does)
  turn() {
    const st = window.game.state, g = st.turning, sh = st.ships[0], T = window.__cfg.SHIP.TURN;
    g.t = 1e-4; g.flipped = false; g.hold = 0; g.dur = T.TIME; sh.pose.turn = g.t / g.dur;
  },
  async settle(maxMs) { const t0 = performance.now(); while (performance.now() - t0 < maxMs) { await this.frame(); const s = this.sample(); if (!s.active) return true; } return false; },
};
window.__acc = { max: {}, min: {}, n: 0, steps: [] };
window.__rec = (s) => { const a = window.__acc; a.n++; for (const k of ['align', 'az', 'elev', 'mul', 'kick', 'roll']) { a.max[k] = Math.max(a.max[k] ?? -Infinity, s[k]); a.min[k] = Math.min(a.min[k] ?? Infinity, s[k]); } if (s.why) a.why = s.why; };
`;
const boot = (steps = 300, seed = 7) => `(async()=>{ ${sl} ${PRE}
  window.__cfg = (await import('/config.js')).config;
  let sd=${seed}; Math.random=()=>{ sd=(sd+0x6D2B79F5)|0; let t=Math.imul(sd^(sd>>>15),1|sd); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
  const g=window.game; window.__upd=g.update.bind(g); window.__step=(n)=>{ for(let i=0;i<n;i++) window.__upd(1/60); };
  const B=document.getElementById('bots'); B.click(); B.click(); await sl(300); document.getElementById('castoff').click(); g.update=()=>{}; window.__step(${steps}); await sl(300); return 1; })()`;
const RESULT = 'JSON.stringify(window.__r||null)';

function run(name, query, steps, extra = []) {
  const file = path.join(out, name + '.json');
  fs.writeFileSync(file, JSON.stringify(steps));
  const args = [path.join(here, 'tools/shot3d.mjs'), '--url', `http://localhost:${port}/host.html?view=3d&${query}`, '--out', path.join(shotDir || out, (shotDir ? prefix.replace(/_$/, '') : 'shot') + '.png'), '--gl', 'default', '--wait', '1500', '--ready', 'window.__meter!==undefined', '--evals-file', file, '--size', '1600x900', '--stats-js', RESULT, ...extra];
  const r = spawnSync(process.execPath, args, { cwd: here, encoding: 'utf8', timeout: 420000 });
  const text = (r.stdout || '') + (r.stderr || '');
  const errs = Number((/console errors: (\d+)/.exec(text) || [])[1] ?? NaN);
  const m = /stats-js (".*")/.exec(text);
  let data = null;
  try { data = m ? JSON.parse(JSON.parse(m[1])) : null; } catch { data = null; }
  const evalErrors = (text.match(/EVAL ERROR/g) || []).length;
  if (has('verbose') || evalErrors) console.log(text.split('\n').filter((l) => /EVAL ERROR|\[page\] (error|EXC)/.test(l)).join('\n'));
  return { text, errs, data, evalErrors };
}
const shotName = (n) => (shotDir ? n : null);
const clean = (name, r) => { if (r.errs !== 0 || r.evalErrors) fail(name + ': console / eval errors (' + r.errs + ' / ' + r.evalErrors + ')'); if (!r.data) fail(name + ': no result'); };
const f2 = (n) => (typeof n === 'number' ? +n.toFixed(3) : n);
const show = (name, d) => console.log('  ' + name + ': ' + JSON.stringify(d, (k, v) => (typeof v === 'number' ? f2(v) : v)).slice(0, 700));

// one pass of a frozen-sim COME ABOUT: 2 sim steps a frame until the turn is over (sampling every frame), then wait for the camera to settle
const turnPass = (shots) => `(async()=>{ ${sl} const c=window.__c; window.__acc={ max:{}, min:{}, n:0 }; c.turn(); const st=window.game.state, sh=st.ships[0];
  let k=0, shotAt=[0.25,0.5,0.75], si=0;
  while(sh.pose.turn>0 && k<500){ window.__step(1); await c.frame(); window.__rec(c.sample()); k++; }
  const peak=window.__acc.max.az, ended=c.sample();
  const settled=await c.settle(9000); const after=c.sample();
  window.__r={ ...(window.__r||{}), turn:{ frames:k, peakAz:peak, minAz:window.__acc.min.az, maxRoll:window.__acc.max.roll, maxAlignDuring:window.__acc.max.align, active:ended.active, settled, after, fired:c.V().cinema.stats.fired } };
  return 1; })()`;
// holds the turn at a fraction and takes a frame once the camera has settled on it
const holdTurn = (u) => `(async()=>{ ${sl} const c=window.__c, st=window.game.state, g=st.turning, sh=st.ships[0]; g.t=${u}*g.dur; sh.pose.turn=${u}; await sl(1400); const s=c.sample(); (window.__r.holds ||= {})['${u}']={ az:s.az, mul:s.mul, roll:s.roll }; return 1; })()`;
const endTurn = `(async()=>{ const c=window.__c, st=window.game.state, g=st.turning, sh=st.ships[0]; g.t=g.dur; window.__step(2); await c.frame(); const ok=await c.settle(9000); const s=c.sample(); window.__r.hold_after={ settled:ok, align:s.align, active:s.active, pose:sh.pose.turn }; return 1; })()`;

try {
  if (want('off')) {
    console.log('1. ?cine=0: a COME ABOUT with the cinematics off');
    const r = run('off', 'cine=0&tier=medium', [[boot(300), 300], [`window.__r={}; 1`, 10], [turnPass(), 100, shotName('cineoff_end')], [holdTurn(0.5), 200, shotName('cineoff_midturn')], [endTurn, 100]]);
    clean('off', r); show('off', r.data);
    const t = r.data && r.data.turn;
    if (t) {
      if (t.frames < 30) fail('off: the turn did not run (' + t.frames + ' frames)');
      if (!(t.maxAlignDuring < 1)) fail('off: the HUD is ' + t.maxAlignDuring + ' px off during the turn (limit 1)');
      if (t.fired.come || t.fired.cast || t.fired.breach || t.fired.finale || t.peakAz > 0) fail('off: a cinematic started with ?cine=0 ' + JSON.stringify(t.fired));
    }
  }

  if (want('come')) {
    console.log('2. COME ABOUT: the gentle dolly and the return');
    const r = run('come', 'tier=medium', [[boot(300), 300], [`window.__r={}; 1`, 10], [`(async()=>{ const c=window.__c; await c.settle(9000); window.__r.afterCast=c.sample(); window.__r.castFired=c.V().cinema.stats.fired.cast; return 1 })()`, 100], [turnPass(), 100, shotName('come_end')],
      [`window.__c.turn(); 1`, 50], [holdTurn(0.02), 100, shotName('come_0')], [holdTurn(0.25), 200, shotName('come_25')], [holdTurn(0.5), 200, shotName('come_50')], [holdTurn(0.75), 200, shotName('come_75')], [endTurn, 100, shotName('come_back')]]);
    clean('come', r); show('come', r.data);
    const t = r.data && r.data.turn;
    if (t) {
      if (!(t.peakAz > 0.2 && t.peakAz <= 0.2601)) fail('come: the dolly peaked at ' + t.peakAz + ' rad (wanted 0.2 .. 0.26)');
      if (!(t.minAz >= -1e-9)) fail('come: the dolly swung past zero (' + t.minAz + '): not critically damped');
      if (!(t.maxRoll < 1e-6)) fail('come: the camera rolled (' + t.maxRoll + ')');
      if (!t.settled || t.after.active || !(t.after.align < 1)) fail('come: after the turn the camera is not the plain lens again ' + JSON.stringify(t.after));
      if (t.fired.come < 1) fail('come: the cinematic never started');
    }
    if (r.data && r.data.afterCast && (r.data.afterCast.active || !(r.data.afterCast.align < 1))) fail('cast off: the camera did not settle back ' + JSON.stringify(r.data.afterCast));
    if (r.data && r.data.hold_after && (!r.data.hold_after.settled || !(r.data.hold_after.align < 1))) fail('come: not aligned after the held turn ' + JSON.stringify(r.data.hold_after));
    if (r.data && r.data.holds && !(r.data.holds['0.5'].az > r.data.holds['0.25'].az * 0.9)) fail('come: the dolly is not larger at the middle of the turn');
  }

  if (want('breach')) {
    console.log('3. the Kraken: the breach pull-back, then the death and the finale orbit');
    const kraken = `(async()=>{ ${sl} const st=window.game.state; let n=0; while(!st.creature && n<40000){ window.__step(100); n+=100; } window.__step(300); const cr=st.creature; window.__r={ krakenAt:n, mode:cr&&cr.mode, env:st.env&&st.env.id }; return 1 })()`;
    const startBreach = `(async()=>{ ${sl} const c=window.__c, st=window.game.state, cr=st.creature, B=await import('/modules/host/creatureBreach.js');
      let k=0; while(cr.mode!=='idle' && k<400){ window.__step(5); k++; }
      window.__r.started=B.startBreach(st, cr, st.ships[0]); window.__acc={ max:{}, min:{}, n:0 };
      let guard=0; while(cr.breach && cr.breach.phase!=='warn' && guard<600){ window.__step(2); await window.__c.frame(); window.__rec(c.sample()); guard++; }
      await sl(1800); const s=c.sample(); window.__r.warn={ phase:cr.breach&&cr.breach.phase, mul:s.mul, elev:s.elev, dy:c.V().cinema.pose.dy, align:s.align, zoom:s.zoom, minZoom:s.minZoom, zoomOut:s.minZoom?s.zoom/(s.mul||1)/s.minZoom:null, roll:s.roll }; return 1 })()`;
    const finishBreach = `(async()=>{ ${sl} const c=window.__c, st=window.game.state, cr=st.creature; let g=0; while(cr.breach && g<900){ window.__step(3); await c.frame(); window.__rec(c.sample()); g++; }
      window.__r.breachMax={ mul:window.__acc.max.mul, elev:window.__acc.max.elev, maxRoll:window.__acc.max.roll, minMul:window.__acc.min.mul }; const ok=await c.settle(9000); const s=c.sample(); window.__r.breachAfter={ settled:ok, align:s.align, active:s.active, fired:c.V().cinema.stats.fired.breach }; return 1 })()`;
    const killIt = `(async()=>{ ${sl} const c=window.__c, st=window.game.state, cr=st.creature, S=await import('/modules/host/creatureSystem.js');
      let k=0; while(cr.mode!=='idle' && cr.mode!=='dying' && k<400){ window.__step(5); k++; }
      const p=cr.parts[0]; const r=S.hurtCreature(st, { part:p, seg:0 }, 1e7, { src:'shell' }); window.__r.kill={ killed:!!(r&&r.killed), mode:cr.mode, slow:st.slow };
      window.__step(3); await c.frame(); window.__acc={ max:{}, min:{}, n:0 }; await sl(2200); const s=c.sample(); window.__r.finale={ slow:st.slow, az:s.az, mul:s.mul, dx:c.V().cinema.pose.dx, align:s.align, roll:s.roll, active:s.active, why:s.why }; return 1 })()`;
    const endFinale = `(async()=>{ ${sl} const c=window.__c, st=window.game.state; let g=0; while(st.creature && g<1500){ window.__step(3); await c.frame(); window.__rec(c.sample()); g++; }
      window.__r.finaleMax={ az:window.__acc.max.az, minAz:window.__acc.min.az, roll:window.__acc.max.roll, frames:g }; const ok=await c.settle(9000); const s=c.sample(); window.__r.finaleAfter={ settled:ok, align:s.align, active:s.active, fired:c.V().cinema.stats.fired }; return 1 })()`;
    const r = run('breach', 'lair=1&creature=kraken&tier=medium', [[boot(200), 300], [kraken, 300], [`(async()=>{ await window.__c.settle(9000); return 1 })()`, 100], [startBreach, 200, shotName('breach_warn')], [finishBreach, 300, shotName('breach_after')], [killIt, 200, shotName('finale_orbit')], [endFinale, 300, shotName('finale_end')]]);
    clean('breach', r); show('breach', r.data);
    const d = r.data || {};
    if (!d.started) fail('breach: the breach did not start (mode ' + d.mode + ')');
    if (d.warn) {
      if (!(d.warn.mul > 1.02)) fail('breach: no pull-back during the warning (mul ' + d.warn.mul + ')');
      if (!(d.warn.elev > 0.05)) fail('breach: the camera did not look further down (' + d.warn.elev + ')');
      if (d.warn.zoomOut != null && d.warn.zoomOut < 1 - 1e-6) fail('breach: the zoom cap was broken (' + d.warn.zoomOut + ')');
      if (!(d.warn.roll < 1e-6)) fail('breach: the camera rolled');
    }
    if (d.breachMax && d.breachMax.minMul < 1 - 1e-9) fail('breach: the camera went IN (' + d.breachMax.minMul + ')');
    if (d.breachAfter && (!d.breachAfter.settled || d.breachAfter.active || !(d.breachAfter.align < 1))) fail('breach: not back on the gameplay lens after the splash ' + JSON.stringify(d.breachAfter));
    if (d.kill && !(d.kill.killed)) fail('kraken: could not be killed in the check');
    if (d.finale && !(d.finale.az > 0.15)) fail('finale: no orbit during the slow motion ' + JSON.stringify(d.finale));
    if (d.finaleMax && (!(d.finaleMax.az <= 0.4401) || !(d.finaleMax.minAz >= -1e-9) || !(d.finaleMax.roll < 1e-6))) fail('finale: the orbit overshot, swung back or rolled ' + JSON.stringify(d.finaleMax));
    if (d.finaleAfter && (!d.finaleAfter.settled || d.finaleAfter.active || !(d.finaleAfter.align < 1))) fail('finale: not back on the gameplay lens ' + JSON.stringify(d.finaleAfter));
  }

  if (want('kick')) {
    console.log('4. a hard hit: the kick in 3 held steps; a weak hit: none');
    const hit = (power) => `(()=>{ const st=window.game.state, sh=st.ships[0], log=(sh.ctx||st).hitLog; const n=(log.length?log[log.length-1].n:0)+1; log.push({ n, t:0, x:sh.layout.refPoint.x+200, y:sh.layout.refPoint.y-50, power:${power}, partId:null, kind:'hit' }); return n })()`;
    const watch = `(async()=>{ const c=window.__c; const seq=[]; const t0=performance.now(); while(performance.now()-t0<700){ await new Promise(r=>requestAnimationFrame(r)); seq.push(+c.sample().kick.toFixed(2)); } const vals=[...new Set(seq.filter(v=>v>0))]; window.__r.kick={ steps:vals, fired:c.V().cinema.stats.fired.kick, last:seq[seq.length-1] }; return 1 })()`;
    const r = run('kick', 'tier=medium', [[boot(300), 300], [`window.__r={}; 1`, 10], [`(async()=>{ await window.__c.settle(9000); return 1 })()`, 100],
      [hit(0.8), 10], [`(async()=>{ await new Promise(r=>setTimeout(r,400)); window.__r.weak=window.__c.V().cinema.stats.fired.kick; return 1 })()`, 10],
      [hit(5), 0], [watch, 100, shotName('kick')], [`(async()=>{ const c=window.__c; await c.settle(3000); const s=c.sample(); window.__r.kickAfter={ align:s.align, active:s.active }; return 1 })()`, 100]]);
    clean('kick', r); show('kick', r.data);
    const d = r.data || {};
    if (d.weak !== 0) fail('kick: a weak hit gave a kick');
    if (d.kick) {
      if (d.kick.fired !== 1) fail('kick: the hard hit gave ' + d.kick.fired + ' kicks');
      if (!(d.kick.steps.length >= 1 && d.kick.steps.length <= 3)) fail('kick: the kick is not 1-3 held steps: ' + JSON.stringify(d.kick.steps));
      if (d.kick.steps.some((v, i, a) => i && v > a[i - 1])) fail('kick: the steps grow: ' + JSON.stringify(d.kick.steps));
      if (d.kick.last !== 0) fail('kick: still kicking after 0.7 s');
    }
    if (d.kickAfter && (d.kickAfter.active || !(d.kickAfter.align < 1))) fail('kick: not aligned afterwards ' + JSON.stringify(d.kickAfter));
  }

  if (want('versus')) {
    console.log('5. Versus: the porthole on the far ship');
    const apart = `(async()=>{ ${sl} const c=window.__c, st=window.game.state; window.__step(120); const a=st.ships[0], b=st.ships[1]; b.pose.x=a.pose.x+14000; b.pose.y=a.pose.y-300; b.pose.vx=0; b.pose.vy=0; window.__step(2); await sl(2500); const V=c.V(), v=window.__lastView; window.__r={ ships:st.ships.length, inset:!!(v&&v.inset), live:!!V.portholeLive, hasP:!!V.porthole, perr:V.porthole&&V.porthole.error, tier:V.tier.name }; return 1 })()`;
    const measure = `(async()=>{ ${sl} const V=window.__c.V(); const ms=[], fps=[]; for(let i=0;i<30;i++){ await sl(100); const s=V.stats(); if(s.porthole) ms.push(s.porthole.ms); } ms.sort((a,b)=>a-b); const s=V.stats(); window.__r.perf={ portholeCpuMs: ms.length?ms[ms.length>>1]:null, portholeCalls: s.porthole&&s.porthole.calls, portholeTris: s.porthole&&s.porthole.tris, size: s.porthole&&[s.porthole.w,s.porthole.h], mainCalls:s.sceneCalls, mainJs:s.jsMs, mainRender:s.renderMs, fps: window.__meter&&window.__meter.fps }; return 1 })()`;
    const together = `(async()=>{ ${sl} const st=window.game.state, a=st.ships[0], b=st.ships[1]; b.pose.x=a.pose.x+900; b.pose.y=a.pose.y+300; window.__step(2); await sl(3500); const V=window.__c.V(), s=V.stats(); window.__r.near={ inset:!!(window.__lastView&&window.__lastView.inset), live:!!V.portholeLive, mainJs:s.jsMs, mainRender:s.renderMs, fps:window.__meter&&window.__meter.fps }; return 1 })()`;
    const boo = `(async()=>{ ${sl} ${PRE} window.__cfg=(await import('/config.js')).config; const g=window.game; window.__upd=g.update.bind(g); window.__step=(n)=>{ for(let i=0;i<n;i++) window.__upd(1/60); }; await sl(800); g.update=()=>{}; window.__step(200); await sl(300); return 1 })()`;
    for (const [tag, q] of [['medium', 'tier=medium'], ['low', 'tier=low']]) {
      const r = run('versus_' + tag, 'versus=1&bots=4&' + q, [[boo, 300], [apart, 200, shotName('versus_porthole_' + tag)], ...(tag === 'medium' ? [[measure, 100], [together, 100]] : [])]);
      clean('versus ' + tag, r); show('versus ' + tag, r.data);
      const d = r.data || {};
      if (d.ships !== 2) fail('versus ' + tag + ': there are ' + d.ships + ' ships');
      if (!d.inset) fail('versus ' + tag + ': the camera did not split (no view.inset); move the ships further apart');
      else if (tag === 'medium' && (!d.live || d.perr)) fail('versus medium: the 3D porthole is not drawn ' + JSON.stringify(d));
      else if (tag === 'low' && d.live) fail('versus low: the 3D porthole is drawn on Low (it keeps the 2D inset)');
      if (d.near && d.near.live) fail('versus: the porthole stays after the ships came together');
    }
  }

  if (!quick && want('long')) {
    for (const [name, q] of [['cine on', 'tier=medium'], ['cine off', 'tier=medium&cine=0']]) {
      console.log('6. 8 bots in real time with a COME ABOUT, ' + name);
      const turn = `(()=>{ const st=window.game.state, g=st.turning, sh=st.ships[0]; sh.pose.vx=0; st.ship.speed=0.1; g.t=1e-4; g.flipped=false; g.hold=0; g.dur=2.6; sh.pose.turn=g.t/g.dur; return 1 })()`;
      const r = run('long_' + name.replace(' ', '_'), q, [[`(async()=>{ ${sl} ${PRE} const b=document.getElementById('bots'); b.click(); b.click(); await sl(500); document.getElementById('castoff').click(); window.__r={}; return 1 })()`, 6000], [turn, 4500, shotName('long_' + name.replace(' ', '_'))],
        [`(async()=>{ ${sl} const c=window.__c, V=c.V(); await sl(6000); const s=c.sample(); window.__r={ errs:window.gameErrors||[], fired:V.cinema.stats.fired, fps:window.__meter&&window.__meter.fps, calls:V.stats().sceneCalls, align:s.align, active:s.active }; return 1 })()`, 100]]);
      clean('long ' + name, r); show('long ' + name, r.data);
      if (r.data && r.data.errs && r.data.errs.length) fail('long ' + name + ': game errors ' + JSON.stringify(r.data.errs).slice(0, 200));
    }
  }
  console.log('  screenshots: ' + (shotDir || out));
} finally {
  try { server.kill(); } catch { /* (gone) */ }
  if (process.platform === 'win32') { try { spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* (gone) */ } }
}
console.log(failed ? 'FAILED: ' + failed : 'PASS cine3d-check');
process.exit(failed ? 1 : 0);

