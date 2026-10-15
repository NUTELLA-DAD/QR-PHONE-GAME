// Full-voyage bot simulation. Plays whole voyages (8 stops) with bot crew and reports how far each got and why it died.
//  --mode quick|voyage|campaign: the session-length mode (config.VOYAGE.MODES); --daily flies today's daily voyage. The table shows median minutes and victory rate.
//  --build sparrow|classic|none: start the voyage with that ship and the Shipwright's Yard (part cards at the sky-docks, the bots vote for them): the table adds the parts bought by the Flagship. Default: sparrow (the ship the browser starts with). `none` = no start build (the classic ship, the old shop: what the golden baseline flies).
//  --profile bot|human (FUN.md F8): how the bots play (config.BOTS.PROFILES). `human` thinks slowly, aims loosely, answers alarms late and steers with a shaky hand, so its win rate is a better compass for people. Default: bot.
// Usage: node tools/voyagesim.mjs [--runs 10] [--difficulty normal] [--mode voyage] [--bots 8] [--humans 0] [--topup] [--maxmin 45] [--stall 8] [--seed 1] [--verbose]
//  natural mode (default): the run ends on a wreck or victory; the cause of the wreck is reported.
//  --topup: the hull is kept full so the run cannot end; reports STALLS (no stop reached for --stall minutes).
//  --runs N > 1 launches N child processes (seeds seed..seed+N-1, 12 at a time) and prints a table.
//  --humans N: the first N bots stand in for human players (flag { human: true }); with N <= 3 on easy/normal and no other bots, ship's mates come aboard.
//    e.g. 2 humans: --bots 2 --humans 2
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

const args = { runs: 1, difficulty: 'normal', mode: 'voyage', daily: false, bots: 8, humans: 0, topup: false, maxmin: 45, seed: 1, verbose: false, child: false, trace: 0, tracefall: 0, dump: 0, stall: 8, set: '', build: 'sparrow', profile: 'bot' };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--help' || a === '-h') { console.log('node tools/voyagesim.mjs [--runs 10] [--difficulty easy|normal|hard] [--mode quick|voyage|campaign] [--daily] [--bots 8] [--humans 0] [--topup] [--maxmin 45] [--stall 8] [--seed 1] [--verbose] [--build sparrow|classic|none] [--profile bot|human] [--set "CREW_SCALE.TABLE.4.fire=0.5;DIFFICULTY.normal.damage=0.2"]'); process.exit(0); }
  else if (a === '--topup' || a === '--verbose' || a === '--child' || a === '--daily') args[a.slice(2)] = true;
  else if (a.startsWith('--') && a.slice(2) in args) { const v = argv[++i]; args[a.slice(2)] = typeof args[a.slice(2)] === 'number' ? Number(v) : v; }
  else { console.error('Unknown option ' + a); process.exit(2); }
}

if (args.runs > 1 && !args.child) {
  const me = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const rows = [];
  const seeds = [];
  for (let i = 0; i < args.runs; i++) seeds.push(args.seed + i);
  const runOne = (seed) => new Promise((res) => {
    const a = [me, '--child', '--seed', String(seed), '--difficulty', args.difficulty, '--mode', args.mode, '--bots', String(args.bots), '--humans', String(args.humans), '--maxmin', String(args.maxmin), '--stall', String(args.stall), '--set', args.set, '--build', args.build, '--profile', args.profile];
    if (args.topup) a.push('--topup');
    if (args.daily) a.push('--daily');
    const c = spawn(process.execPath, a);
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.on('close', () => { const l = out.split('\n').find((x) => x.startsWith('RESULT ')); res(l ? JSON.parse(l.slice(7)) : { seed, error: out.slice(-300) }); });
  });
  let next = 0;
  await Promise.all(Array.from({ length: 12 }, async () => { while (next < seeds.length) { const s = seeds[next++]; rows.push(await runOne(s)); } }));
  rows.sort((a, b) => a.seed - b.seed);
  console.log(`--- voyagesim ${args.topup ? 'TOP-UP' : 'NATURAL'} ${args.mode}${args.daily ? ' (daily)' : ''} ${args.difficulty}, ${args.bots} bots (${args.humans} as humans), ${args.runs} runs ---`);
  for (const r of rows) {
    if (r.error) { console.log(`seed ${r.seed}: ERROR ${r.error}`); continue; }
    console.log(`seed ${String(r.seed).padStart(3)}: stops ${r.done}/${r.total} ${r.victory ? 'VICTORY' : r.timeout ? 'TIMEOUT' : 'wreck'} ${(r.minutes || 0).toFixed(1)}min${args.topup ? ` stalls ${r.stalls} [${(r.stallInfo || []).join("; ")}]` : ""} | ${r.cause}${(r.ringStops || []).length ? ' | castles: ' + r.ringStops.map((x) => x.variant + ' ' + (((x.tFell != null ? x.tFell : x.t1) - x.t0) / 3600).toFixed(1) + (x.tFell != null ? ' fell' : ' not') + (x.attempts > 1 ? ' x' + x.attempts : '')).join(', ') : ''}`); // (F12: the castle stops of the voyage)
  }
  const ok = rows.filter((r) => !r.error);
  const ds = ok.map((r) => r.done).sort((a, b) => a - b);
  const med = ds.length ? (ds[(ds.length - 1) >> 1] + ds[ds.length >> 1]) / 2 : 0;
  const mins = ok.map((r) => r.minutes || 0).sort((a, b) => a - b);
  const medMin = mins.length ? (mins[(mins.length - 1) >> 1] + mins[mins.length >> 1]) / 2 : 0;
  const vm = ok.filter((r) => r.victory).map((r) => r.minutes).sort((a, b) => a - b);
  const medVic = vm.length ? (vm[(vm.length - 1) >> 1] + vm[vm.length >> 1]) / 2 : 0;
  console.log(`MODE ${args.mode}: median ${medMin.toFixed(1)} min (victories only: ${medVic.toFixed(1)}; range ${(mins[0] || 0).toFixed(1)}-${(mins[mins.length - 1] || 0).toFixed(1)}), victory rate ${ok.filter((r) => r.victory).length}/${ok.length}`);
  console.log(`median stops ${med}, mean ${(ds.reduce((a, b) => a + b, 0) / (ds.length || 1)).toFixed(1)}, victories ${ok.filter((r) => r.victory).length}/${ok.length}, timeouts ${ok.filter((r) => r.timeout).length}${args.topup ? `, runs with stalls ${ok.filter((r) => r.stalls).length}` : ''}, errors ${ok.reduce((a, r) => a + (r.errors || 0), 0)}`);
  { const m = ok.map((r) => r.mates || {}); const jobs = {}; for (const x of m) for (const [k, v] of Object.entries(x.jobs || {})) jobs[k] = (jobs[k] || 0) + v; const tot = Object.values(jobs).reduce((a, b) => a + b, 0) || 1; console.log(`ship's mates: max aboard ${Math.max(0, ...m.map((x) => x.max || 0))}, station snapshots ${m.reduce((a, x) => a + (x.locks || 0), 0)}, in awards ${m.filter((x) => x.inAwards).length} runs; mate time: ${Object.entries(jobs).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + Math.round((100 * v) / tot) + '%').join(', ') || 'n/a'}`); }
  { const L = ok.map((r) => r.lairs || { planned: 0, met: 0, won: 0, how: {} }), how = {}; for (const l of L) for (const [k, v] of Object.entries(l.how || {})) how[k] = (how[k] || 0) + v; console.log(`creature lairs (Kraken, Drake, Thunderbird, Island Titan, Rime Wyrm and Mycelial Mother): ${L.reduce((a, l) => a + l.planned, 0)} on the routes of ${ok.length} voyages, ${L.reduce((a, l) => a + l.met, 0)} met, ${L.reduce((a, l) => a + l.won, 0)} won (${Object.entries(how).map(([k, v]) => k + ' ' + v).join(', ') || 'none'})`); }
  { // the teaching curriculum (G0): the ship's power against the expected curve and the skulls, per column reached; and the lairs and salvage runs offered and taken
    const by = {};
    for (const r of ok) for (const c of r.curve || []) { const b = (by[c.col] ??= { n: 0, pw: [], exp: [], dg: 0, base: 0, kinds: {}, salvage: 0, lair: 0 }); b.n++; if (c.power != null) b.pw.push(c.power); if (c.exp != null) b.exp.push(c.exp); b.dg += c.danger; b.base += c.base || 0; b.kinds[c.kind] = (b.kinds[c.kind] || 0) + 1; if (c.salvage) b.salvage++; if (c.lair) b.lair++; }
    const avg = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : ' n/a');
    console.log('curriculum, per column reached: col  reached  power  expected  skulls  (base)  kinds');
    for (const c of Object.keys(by).map(Number).sort((a, b) => a - b)) { const b = by[c]; console.log(`  ${String(c + 1).padStart(2)}  ${String(b.n).padStart(3)}/${ok.length}  power ${avg(b.pw)}  expected ${avg(b.exp)}  skulls ${(b.dg / b.n).toFixed(2)}  (base ${(b.base / b.n).toFixed(2)})  ${Object.entries(b.kinds).map(([k, v]) => k + ' ' + v).join(', ')}${b.salvage ? ', SALVAGE ' + b.salvage : ''}${b.lair ? ', LAIR ' + b.lair : ''}`); }
    const O = ok.map((r) => r.offers || { lair: [], salvage: [], taken: [] });
    const sum = (f) => O.reduce((a, o) => a + f(o), 0);
    { // LOOP.md G5 / G6: wrecks, named parts, the salvage run (the field kind: needs 3 crew) and DEFEND
      const Dd = ok.map((r) => r.derelict).filter(Boolean), s = (f) => Dd.reduce((a, d) => a + (f(d) || 0), 0), df = sum((o) => (o.defend || []).length), dt = sum((o) => o.taken.filter((id) => (o.defend || []).includes(id)).length);
      console.log(`wrecks (G5 / G6): DEFEND stops offered ${df}, taken ${dt}; per ${ok.length} voyages: salvage runs won ${s((d) => d.run && d.run.won)} lost ${s((d) => d.run && d.run.lost)}, DEFEND won ${s((d) => d.run && d.run.defendWon)} lost ${s((d) => d.run && d.run.defendLost)}, wrecks boarded ${s((d) => d.run && d.run.boarded)}, parts stripped ${s((d) => d.run && d.run.stripped)}, hauled aboard ${s((d) => d.run && d.run.hauled)}, named parts bought ${s((d) => d.run && d.run.named)} (waiting unbought ${s((d) => d.run && d.run.pending)}), bot strip trips ${s((d) => d.wrecks && d.wrecks.trips)}`);
    }
    console.log(`offered and taken: lairs offered ${sum((o) => o.lair.length)}, taken ${sum((o) => o.taken.filter((id) => o.lair.includes(id)).length)}; salvage runs offered ${sum((o) => o.salvage.length)}, taken ${sum((o) => o.taken.filter((id) => o.salvage.includes(id)).length)} (over ${ok.length} voyages)`);
  }
  { // the ramp (FUN.md F1): per column, the hull mean while flying and the median minutes a stop took (docks included)
    const col = {};
    for (const r of ok) for (const b of r.hullBy || []) { const c = (col[b.col] ??= { hull: 0, n: 0, min: [] }); c.hull += b.hull; c.n += b.n; c.min.push((b.t1 - b.t0) / 3600); }
    console.log('ramp, per column: ' + Object.keys(col).map(Number).sort((a, b) => a - b).map((k) => `${k + 1}: hull ${(col[k].hull / Math.max(1, col[k].n)).toFixed(1)}, ${col[k].min.sort((a, b) => a - b)[col[k].min.length >> 1].toFixed(1)} min (${col[k].min.length})`).join(' | '));
  }
  { // SCRAP (LOOP.md G1): bundles caught (landed on a deck or taken off a hulk) and stowed per stop FLOWN (done = stops finished, the one she ended on included), against config.SCRAP.INCOME_TARGET
    const sc = ok.filter((r) => r.scrap), { config: cfg } = await import(new URL("../public/config.js", import.meta.url).href);
    if (sc.length) {
      const stops = sc.reduce((a, r) => a + Math.max(1, r.done), 0), sum = (k) => sc.reduce((a, r) => a + (r.scrap[k] || 0), 0), caught = sum('landed') + sum('taken');
      const per = sc.map((r) => (r.scrap.landed + r.scrap.taken) / Math.max(1, r.done)).sort((a, b) => a - b);
      const by = {}; for (const r of sc) for (const [k, v] of Object.entries(r.scrap.by || {})) by[k] = (by[k] || 0) + v;
      console.log(`scrap: per stop ${(caught / stops).toFixed(1)} caught (target ${cfg.SCRAP.INCOME_TARGET.join('-')}; runs ${per[0].toFixed(1)}-${per[per.length - 1].toFixed(1)}, median ${per[(per.length - 1) >> 1].toFixed(1)}), ${(sum('stowed') / stops).toFixed(1)} stowed, ${(sum('spawned') / stops).toFixed(1)} fell (${Object.entries(by).map(([k, v]) => k + ' ' + (v / stops).toFixed(1)).join(', ') || 'none'}), ${(sum('lost') / stops).toFixed(1)} lost; hooked ${sum('hooked')}, hulks ${sum('hulks')} (${sum('taken')} bundles off them), dumped ${sum('dumped')}; hold avg ${(sum('holdSum') / Math.max(1, sum('holdN'))).toFixed(1)}/${cfg.SCRAP.HOLD_CAP}, carrying ${(100 * sum('carrySecs') / Math.max(1, sum('crewSecs'))).toFixed(1)}% of crew time`);
      { const fr = sc.filter((r) => r.frames), fs = (k) => fr.reduce((a, r) => a + (r.frames[k] || 0), 0); if (fr.length) console.log(`frames (G4): per voyage ${(fs('bought') / fr.length).toFixed(1)} frames bought, ${(fs('built') / fr.length).toFixed(1)} parts built from them (${(fs('bundles') / fr.length).toFixed(1)} bundles carried in), ${(fs('open') / fr.length).toFixed(1)} still waiting at the end; parts in all ${(sc.reduce((a, r) => a + (r.parts || []).length, 0) / sc.length).toFixed(1)}; carrying ${(100 * sum('carrySecs') / Math.max(1, sum('crewSecs'))).toFixed(1)}% of crew time`); }
      console.log(`scrap (G2): per voyage ${(sum('stowed') / sc.length).toFixed(1)} stowed against ${(sum('dumped') / sc.length).toFixed(1)} dumped; ${(sum('patched') / sc.length).toFixed(1)} patches riveted (${sum('patchSaves')} held segments saved), ${(sum('spent') / sc.length).toFixed(1)} bundles paid at the docks for ${(sum('built') / sc.length).toFixed(1)} cards (parts and fittings)`);
    }
  }
  { // STRUCTURE (STRUCTURE.md): the falls and crashes per voyage, and what every wreck (limps included) was
    const st = ok.filter((r) => r.struct), n = st.length, sum = (k) => st.reduce((a, r) => a + (r.struct[k] || 0), 0), by = {};
    for (const r of ok) for (const w of r.wrecks || []) by[w] = (by[w] || 0) + 1;
    if (n) console.log(`structure: per voyage falls ${(sum('falls') / n).toFixed(1)} (saved ${(sum('saved') / n).toFixed(1)}), crashes ${(sum('crashes') / n).toFixed(1)}, failures ${(sum('failures') / n).toFixed(1)}, splits ${(sum('splits') / n).toFixed(1)}, folds ${(sum('folds') / n).toFixed(1)}; wrecks (limps too) ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' x' + v).join(', ') || 'none'}`);
  }
  { // FUN (FUN.md F8): how the voyages felt - overruns, idle seats, menu time, dull gaps, the first threat of each stop, FALLING alarms per stop (tools/funmetrics.mjs)
    const fr = ok.filter((r) => r.fun), n = fr.length, sum = (k) => fr.reduce((a, r) => a + r.fun[k], 0), pc = (a, b) => (b > 0 ? (100 * a / b).toFixed(1) + '%' : 'n/a');
    if (n) {
      const gaps = fr.map((r) => r.fun.gapMax).sort((a, b) => a - b), cols = {};
      for (const r of fr) { for (const c of Object.keys(r.fun.flown)) (cols[c] ??= { flown: 0, thr: [], falls: 0 }).flown++; for (const [c, v] of Object.entries(r.fun.threat)) cols[c].thr.push(v); for (const [c, v] of Object.entries(r.fun.falls)) (cols[c] ??= { flown: 0, thr: [], falls: 0 }).falls += v; }
      const keys = Object.keys(cols).map(Number).sort((a, b) => a - b), mean = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(0) + 's' : 'none');
      console.log(`fun (profile ${args.profile}, build ${args.build}): overrun ${(sum('overrun') / n).toFixed(2)} per voyage (${fr.filter((r) => r.fun.overrun).length}/${n} voyages had one), idle% ${pc(sum('idleSecs'), sum('seatSecs'))} of seat time (gun seats ${pc(sum('gunIdleSecs'), sum('gunSecs'))}), menu s/stop ${(sum('menuSecs') / Math.max(1, sum('scorecards'))).toFixed(0)} (${sum('scorecards')} scorecards), longest no-moment gap median ${gaps[(gaps.length - 1) >> 1].toFixed(0)}s max ${gaps[gaps.length - 1].toFixed(0)}s`);
      { const stl = ok.filter((r) => r.struct), to = ok.filter((r) => r.timeout); console.log(`ground (F5): sitting grounded and still with no alarm ${(sum('groundStillSecs') / n).toFixed(0)}s per voyage, ground-stall alarms ${(stl.reduce((a, r) => a + ((r.struct.why || {}).stalled || 0), 0) / Math.max(1, stl.length)).toFixed(2)} per voyage, timeouts that ended on the ground ${to.filter((r) => r.groundedAtEnd).length}/${to.length}`); }
      console.log('  by stop: ' + keys.map((c) => `${c + 1}: first threat ${mean(cols[c].thr)} (${cols[c].thr.length}/${cols[c].flown}), falls ${(cols[c].falls / cols[c].flown).toFixed(1)}`).join(' | '));
    }
  }
  { // STEAM (FUN.md F13): why the falls came (goingDown.js stats.why), the share of flight with the steam short, and the state of the steam when each FALLING alarm began
    const fr = ok.filter((r) => r.fun && r.fun.steam), n = fr.length;
    if (n) {
      const S = (k) => fr.reduce((a, r) => a + r.fun.steam[k], 0), fl = Math.max(1, S('flight')), pc = (k) => (100 * S(k) / fl).toFixed(1) + '%';
      const why = {}, at = fr.flatMap((r) => r.fun.steam.at), avg = (f, a = at) => (a.length ? (a.reduce((x, y) => x + f(y), 0) / a.length).toFixed(1) : 'n/a');
      for (const r of ok) for (const [k, v] of Object.entries((r.struct && r.struct.why) || {})) why[k] = (why[k] || 0) + v;
      const tw = Object.values(why).reduce((a, b) => a + b, 0) || 1;
      console.log(`falls by cause: ${Object.entries(why).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v} (${Math.round(100 * v / tw)}%)`).join(', ') || 'none'}`);
      console.log(`steam (F13, share of flight): pressure under 30 ${pc('lowPress')}, firebox under 12 ${pc('lowFuel')}, a burst pipe open ${pc('pipe')}, leaks over 3 ${pc('leaking')}, boiler broken ${pc('boilerOut')}, fuel under 30 with nobody carrying coal ${pc('nobodyStoking')}`);
      console.log(`  boiler: ${(S('blowouts') / n).toFixed(1)} blowouts a voyage, broken ${(S('boilerBreaks') / n).toFixed(1)} times a voyage, pressure at 90 or more ${pc("over90")} of the flight; it broke by ${(() => { const w = {}; for (const r of fr) for (const [k, v] of Object.entries(r.fun.steam.boilerWhy || {})) w[k] = (w[k] || 0) + v; return Object.entries(w).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ") || "never"; })()}`);
      console.log(`  burst pipes: ${S('bursts')} (${(S('bursts') / n).toFixed(1)} per voyage), valve open ${(S('burstSecs') / Math.max(1, S('bursts'))).toFixed(1)}s on average, longest ${Math.max(...fr.map((r) => r.fun.steam.burstMax)).toFixed(0)}s, ${S('burstStuck')} still open after 20s; they burst by ${(() => { const w = {}; for (const r of fr) for (const [k, v] of Object.entries(r.fun.steam.why || {})) w[k] = (w[k] || 0) + v; return Object.entries(w).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'; })()}`);
      const byWhy = {}; for (const a of at) (byWhy[a.why] ||= []).push(a);
      { const g = at.filter((a) => a.why === 'grounded'), by = {}; for (const a of g) { const k = `${a.map || '?'}${a.helm ? '' : ' nohelm'}`; by[k] = (by[k] || 0) + 1; } if (g.length) console.log(`    grounded by map: ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(', ')}; short ${avg((a) => a.short ?? 0, g)} pump input ${avg((a) => a.input, g)} vy ${avg((a) => a.vy, g)} unstick ${g.filter((a) => a.unstick).length}`); }
      console.log(`  at the start of ${at.length} falls: press ${avg((a) => a.press)} fuel ${avg((a) => a.fuel)} pump ${avg((a) => a.pump)} leaks ${avg((a) => a.leaks)} engines ${avg((a) => a.eng)} vents ${avg((a) => a.vents)} speed ${avg((a) => a.speed)}; pipe open ${at.filter((a) => a.pipe).length}, boiler broken ${at.filter((a) => a.boilerOut).length}, nobody stoking ${at.filter((a) => !a.stoking).length}, fuel under 15 ${at.filter((a) => a.fuel < 15).length}, press under 30 ${at.filter((a) => a.press < 30).length}`);
      for (const [k, a] of Object.entries(byWhy)) console.log(`    ${k} (${a.length}): press ${avg((x) => x.press, a)} fuel ${avg((x) => x.fuel, a)} pump ${avg((x) => x.pump, a)} leaks ${avg((x) => x.leaks, a)} engines ${avg((x) => x.eng, a)} gas ${avg((x) => x.gas, a)} holes ${avg((x) => x.holes, a)} broken ${avg((x) => x.brokenMods, a)}; pipe open ${a.filter((x) => x.pipe).length}, boiler broken ${a.filter((x) => x.boilerOut).length}, coal dumped ${a.filter((x) => x.coalOut).length}, no helm ${a.filter((x) => !x.helm).length} (dark ${a.filter((x) => x.helmDark).length}), fires>=2 ${a.filter((x) => x.fires >= 2).length}, KO>=2 ${a.filter((x) => x.ko >= 2).length}, fuel<15 ${a.filter((x) => x.fuel < 15).length}, press<30 ${a.filter((x) => x.press < 30).length}, nobody stoking ${a.filter((x) => !x.stoking).length}`);
    }
  }
  { // STOP SHAPE (FUN.md F6): briefings, escapes, the gunship as the one big thing, mid-voyage zeppelins, and the dock's three cards
    const sh = ok.filter((r) => r.shape), n = sh.length, sum = (k) => sh.reduce((a, r) => a + r.shape[k], 0), cards = {};
    for (const r of sh) for (const [k, v] of Object.entries(r.shape.cards)) cards[k] = (cards[k] || 0) + v;
    if (n) console.log(`stop shape: ${sum('stops')} stops flown, ${sum('brief')} briefings, ${sum('escape')} escapes, gunship set piece at ${sum('gunship')} of them (${sum('plain')} stops had neither lair nor ring), ${sum('midBoss')} mid-voyage zeppelins; ${sum('docks')} docks, cards [${Object.entries(cards).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(', ')}], dock s ${(sum('dockSecs') / Math.max(1, sum('docks'))).toFixed(1)}, scorecard+dock+route s/stop ${(sum('menuSecs') / Math.max(1, sum('stops'))).toFixed(0)}`);
  }
  { // RING STOPS (FUN.md F12): the castle stops, per kind. Minutes = from the first moment the castle was in the sky to the fall of its crown (a limp home and the stops flown on the way count: that is how long the stop took the crew); a stop that never fell counts how long she was there when the voyage ended. Unfinished: the clock ran out (clock) or she was wrecked there for good / the run ended elsewhere (ended)
    const rs = ok.flatMap((r) => (r.ringStops || []).map((x) => ({ ...x, timeout: !!r.timeout })));
    const med = (a) => (a.length ? ((a = a.slice().sort((x, y) => x - y)), (a[(a.length - 1) >> 1] + a[a.length >> 1]) / 2).toFixed(1) : 'n/a');
    if (rs.length) {
      const mins = (x) => ((x.tFell != null ? x.tFell : x.t1) - x.t0) / 3600;
      const line = (name, l) => `${name} ${l.length} (fell ${l.filter((x) => x.tFell != null).length}: median ${med(l.filter((x) => x.tFell != null).map(mins))} min; unfinished clock ${l.filter((x) => x.tFell == null && x.timeout).length} / ended ${l.filter((x) => x.tFell == null && !x.timeout).length}, they were there ${med(l.filter((x) => x.tFell == null).map(mins))} min; all-stops median ${med(l.map(mins))} min; attempts ${(l.reduce((a, x) => a + x.attempts, 0) / l.length).toFixed(1)}, first face at ${med(l.filter((x) => x.firstFace != null).map((x) => (x.firstFace - x.t0) / 3600))} min, faces down ${l.reduce((a, x) => a + x.down, 0)}/${l.reduce((a, x) => a + x.faces, 0)})`;
      console.log('ring stops (F12): ' + [['all', rs], ...['tower', 'fortress', 'citadel'].map((v) => [v, rs.filter((x) => x.variant === v)])].filter(([, l]) => l.length).map(([n, l]) => line(n, l)).join(' | '));
    }
  }
  { // PLAY OF THE MISSION (SHIPS_BOOK.md L7): scorecards, how many had a film of the stop's top moment, awards per card, the recorder's memory (only with BOOK_ON=1)
    const pl = ok.filter((r) => r.play && r.play.cards), sum = (k) => pl.reduce((a, r) => a + (r.play[k] || 0), 0);
    if (pl.length) console.log(`play of the mission (L7): ${sum('cards')} scorecards, ${sum('films')} with a film (${Math.round((100 * sum('films')) / Math.max(1, sum('cards')))}%, ${(sum('filmSecs') / Math.max(1, sum('films'))).toFixed(1)} s of sky each), ${(sum('awards') / Math.max(1, sum('cards'))).toFixed(1)} awards a card, recorder peak ${Math.round(Math.max(...pl.map((r) => r.play.peakKb)))} KB`);
  }
  { // THE NEMESIS (SHIPS_BOOK.md L4): how often she flew, was driven off, was sunk for good, and bested the ship (only with BOOK_ON=1)
    const nm = ok.filter((r) => r.nemesis), sum = (k) => nm.reduce((a, r) => a + (r.nemesis[k] || 0), 0);
    if (nm.length) console.log(`nemesis (L4): met ${sum('meetings')} times in ${nm.filter((r) => r.nemesis.meetings).length} of ${nm.length} voyages, driven off ${sum('escapes')}, sunk for good ${sum('slain')}, bested the ship ${sum('ours')}, final showdowns ${sum('final')}`);
  }
  { const n = ok.reduce((a, r) => a + (r.breaks || 0), 0); if (n) console.log(`parts broke off ${n} time(s) in ${ok.filter((r) => r.breaks).length} of ${ok.length} voyages: ${[...new Set(ok.flatMap((r) => r.breakCauses || []))].join(', ')}`); }
  const causes = {};
  for (const r of ok) for (const k of r.flags || []) causes[k] = (causes[k] || 0) + 1;
  if (args.build !== 'none') { console.log('salvage earned per run: ' + ok.map((r) => r.earned).join(', ')); const pc = ok.map((r) => (r.parts || []).length); const win = ok.filter((r) => r.victory).map((r) => (r.parts || []).length); const all = {}; for (const r of ok) for (const id of r.parts || []) all[id] = (all[id] || 0) + 1; console.log(`parts bought by the end (start ship ${args.build}): mean ${(pc.reduce((a, b) => a + b, 0) / (pc.length || 1)).toFixed(1)}, victories only ${(win.reduce((a, b) => a + b, 0) / (win.length || 1)).toFixed(1)}; which: ${Object.entries(all).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + '=' + v).join(', ')}`); }
  console.log('wreck flags: ' + Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(', '));
  process.exit(0);
}

globalThis.window ??= globalThis;
const store = new Map();
globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
if (process.env.NOT_FIRST_EVER) localStorage.setItem('airshipVoyage', JSON.stringify({ version: 3, totalRuns: 5 })); // (P1: this TV has flown before: the route is a varied one - a rolled opening, a Titan on some routes, the Drake and the Wyrm as light lairs; without it the first-ever route, as before)
globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 16);
{
  let s = args.seed >>> 0;
  Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Date.now = () => 1700000000000 + args.seed;
}
const realNow = performance.now.bind(performance);
let simClock = 0;
performance.now = () => simClock;

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'public');
const load = (p) => import(pathToFileURL(path.join(root, p)).href);
const { config } = await load('config.js');
if (process.env.NO_BREAKOFF) config.BREAKOFF.ENABLED = false; // (compare voyages with parts never breaking off: S.5i)
if (!process.env.WITH_SPYGLASS) config.SPYGLASS.BOTS = false; // (bot lookouts pan and spot the spyglass in the game; the voyage baselines keep their numbers)
if (args.build === 'raft' && !process.env.NO_SCRAP) config.SCRAP.ENABLED = true; // (P5: the raft is built from carried scrap - its gift is frames - so scrap is on for her, as in the game)
if (process.env.NO_CURRICULUM) config.VOYAGE.CURRICULUM.ENABLED = false; // (compare voyages with the old random skies and kinds instead of the teaching curriculum: G0)
if (process.env.NO_LAIRS) config.CREATURES.LAIR.COUNT = { short: 0, long: 0 }; // (compare voyages with no Kraken lair on the route: C.3)
if (process.env.NO_MOTHER) delete config.CREATURES.LAIR.BY_ENV.fungal; // (C.6e: compare voyages with no Mycelial Mother lair on the Fungal Depths stops)
if (process.env.NO_WYRM) delete config.CREATURES.LAIR.BY_ENV.frost; // (C.6d: compare voyages with no Rime Wyrm lair on the Frost Peaks stops)
if (process.env.NO_TITAN) config.CREATURES.TITAN.LAIR.ENABLED = false; // (C.6c: compare voyages with no Island Titan lair on the early stop)
if (!config.BOTS.PROFILES[args.profile]) { console.error('Bad profile; use ' + Object.keys(config.BOTS.PROFILES).join('|')); process.exit(2); }
config.BOTS.PROFILE = args.profile; // (FUN.md F8: --profile human makes the bots fail like people)
// --set "A.B.C=value;...": tweak config numbers for tuning runs
for (const kv of args.set.split(';').filter(Boolean)) { const [k, v] = kv.split('='); const ks = k.split('.'); let o = config; for (const x of ks.slice(0, -1)) o = o[x] ??= {}; o[ks[ks.length - 1]] = Number.isNaN(Number(v)) ? v : Number(v); }
const { SHIP_LAYOUT, kindOf } = await load('shipLayout.js');
const { damageMul } = await load('modules/host/crewscale.js');
const { hullOrStructure } = await load('modules/host/structure.js');
const { createSimulation } = await load('modules/host/simulation.js');
const { expectedPower: exp } = await load('modules/host/voyage.js');
const maps = await load("modules/host/maps.js");
const course = await load("modules/host/course.js");
const sim = createSimulation();
const state = sim.state;
const { createFunMetrics } = await import(pathToFileURL(path.join(root, '..', 'tools', 'funmetrics.mjs')).href);
const { targets: aimTargets } = await load('modules/host/aim.js');
const fun = createFunMetrics(state, { kindOf, targets: aimTargets, moments: sim.moments }); // (FUN.md F8: overrun, idle seats, menu time, dull gaps, first threat and falls per stop)
state.difficulty = args.difficulty;
sim.setSession(args.mode, args.daily);
if (args.build !== 'none') { // (--build sparrow | classic | a .json / .mjs / fixture name: any parts list is registered as BUILDS.custom and used as the start ship)
  const { BUILDS } = await load('modules/host/shipBuild.js');
  if (!BUILDS[args.build]) {
    const { loadBuild } = await import(pathToFileURL(path.join(root, '..', 'tools', 'buildload.mjs')).href);
    BUILDS.custom = await loadBuild(args.build, BUILDS);
    args.build = 'custom';
  }
  sim.setStartBuild(args.build);
}
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const e = SHIP_LAYOUT.boarderEntryPoints;
for (let i = 0; i < args.bots; i++) {
  const id = 'bot' + Math.random();
  state.players[id] = { id, bot: true, human: i < args.humans, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[(Math.random() * config.CREW_SPECIES.length) | 0], color: colors[(Math.random() * colors.length) | 0], x: e[0].x + Math.random() * (e[1].x - e[0].x), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
}
sim.castOff();

const dt = 1 / 60;
const maxSteps = Math.round(args.maxmin * 3600);
let errorCount = 0;
let lastCol = 0, lastProgress = 0, stalls = 0, stalled = false;
let snapshot = null;
const rolling = { helmEmpty: 0, flying: 0, br: 0, fires: 0, gh: 0, crew: {}, n: 0 };
const snap = () => {
  const players = Object.values(state.players);
  const helmMan = players.find((q) => kindOf(q.lock) === 'helm');
  const helmMod = (state.modules || []).find((m) => m.kind === 'helm');
  const broken = (state.modules || []).filter((m) => m.broken).map((m) => m.name);
  return {
    stop: state.run ? state.run.stopId : null, mk: state.course && state.course.map ? state.course.map.kind + (state.course.map.open ? ':' + state.course.map.outposts.filter((o) => o.done).length + '/' + state.course.map.outposts.length : '') + ' spd ' + state.ship.speed.toFixed(2) : null,
    env: state.env && state.env.id,
    helmManned: !!helmMan, helmBroken: !!(helmMod && helmMod.broken),
    koCount: players.filter((q) => q.ko > 0).length,
    gas: Math.round(state.ship.gas), holes: (state.gasHoles || []).length, breaches: state.breaches.length,
    press: Math.round(state.ship.press), fuel: Math.round(state.ship.fuel), leaks: +(((state.steamParts && state.steamParts.leaks) || 0)).toFixed(1),
    boarders: state.boarders.length, fires: state.fires.length, broken, alt: Math.round(state.ship.alt),
    flood: state.sea ? +state.sea.flood.toFixed(2) : 0,
    clog: Math.max(0, ...(state.clogs || []).map((c) => c.lvl)).toFixed(2), o2: state.env && state.env.o2 != null ? +state.env.o2.toFixed(2) : null,
  };
};
const stallInfo = [];
const mateStat = { snaps: 0, jobs: {}, locks: 0, max: 0 }; // ship's mates seen in the snapshots: what they were doing, and whether any ever held a station
const mateInfo = () => ({ max: mateStat.max, locks: mateStat.locks, jobs: mateStat.jobs, inAwards: Object.values(state.run.crew).some((c) => c.name === "Mate") || ((state.runEnd && state.runEnd.rows) || []).some((r) => r.name === "Mate") });
const dmg = { fire: 0, breach: 0, direct: 0 }; // hull points lost to fires, hull holes and everything else
let result = null;
const curve = []; // (G0: per stop reached, the ship's power against the curriculum's expected power and the stop's skulls)
let curveStop = null;
const lairs = { seen: new Set(), won: new Set(), met: 0, how: {} };
const shape = { stops: 0, plain: 0, brief: 0, escape: 0, gunship: 0, midBoss: 0, docks: 0, cards: {}, dockSecs: 0, menuSecs: 0 }, shapeSeen = {}; let shapeStop = null; // (F6)
const play = { cards: 0, films: 0, filmSecs: 0, awards: 0, peakKb: 0 }; let playSeen = null; // (L7: scorecards, how many had a film, the film's seconds of sky, awards shown, the recorder's biggest memory)
const hullBy = {}; // (F1: per stop flown, the hull while flying and the minutes: result.hullBy)
const ringStops = {}; // (F12: per ring stop: the castle, when it was entered, when its crown fell, how many faces were down at the last step)
const wrecks = []; // (balance pass: the text of every wreck of the voyage, limps included, from the moment the ship goes down)
let wasDown = 0;
for (let step = 1; step <= maxSteps && !result; step++) {
  try {
    simClock += dt * 1000;
    if (args.topup && state.phase === 'flying' && !state.ship.down) { state.ship.hull = 100; state.ships[0].sim.structure.restoreAll(); } // (the frame is the hull now: STRUCTURE.md WP6)
    // remember the recent past so we can describe the build-up to a wreck
    if (state.phase === 'flying' && !state.ship.down && step % 30 === 0) { snapshot = snap(); rolling.flying++; rolling.br += snapshot.breaches; rolling.fires += snapshot.fires; rolling.gh += snapshot.holes; for (const q of Object.values(state.players)) { if (q.mate) { mateStat.snaps++; const mk = q.ko > 0 ? "ko" : q.botJob ? q.botJob.kind : "idle"; mateStat.jobs[mk] = (mateStat.jobs[mk] || 0) + 1; if (q.lock) mateStat.locks++; continue; } const k = q.ko > 0 ? "ko" : q.lock ? "station" : q.botJob ? (["fire", "patch", "repair", "swat", "valve", "ice", "unclog", "oxygen", "vent", "coal", "ammo", "revive"].includes(q.botJob.kind) ? "chore" : q.botJob.kind === "fight" ? "fight" : "other") : "idle"; rolling.crew[k] = (rolling.crew[k] || 0) + 1; rolling.n++; } if (!snapshot.helmManned) rolling.helmEmpty++; }
    const h0 = hullOrStructure(state.ship), nf = state.fires.length, nb = state.breaches.length, fl = state.phase === 'flying' && !state.ship.down;
    sim.update(dt);
    fun.step(dt);
    if (args.tracefall) { // (F13: --tracefall 1 prints the 10 s before every FALLING alarm, twice a second, to stderr)
      if (step % 30 === 0) { const hm = Object.values(state.players).find((q) => kindOf(q.lock) === 'helm'); (globalThis.__tf ??= []).push(`  t=${(step / 3600).toFixed(2)} alt ${Math.round(state.ship.alt)} vy ${Math.round(state.ship.vy || 0)} spd ${state.ship.speed.toFixed(2)} gas ${state.ship.gas.toFixed(0)} short ${state.liftWeight ? Math.round(state.liftWeight.weight - state.liftWeight.lift) : '-'} in ${(state.gasValve.input || 0).toFixed(2)} press ${Math.round(state.ship.press)} fuel ${Math.round(state.ship.fuel)} gnd ${state.grounded ? 1 : 0} helm ${hm ? (hm.bot ? 'bot' : 'P') + ' jy ' + (hm.jy || 0).toFixed(2) + ' gas ' + (hm.gas || 0).toFixed(2) : 'EMPTY'} leaks ${((state.steamParts && state.steamParts.leaks) || 0).toFixed(1)} map ${state.course && state.course.map ? state.course.map.kind + (state.course.map.open ? '' : ':cave') : '-'} unstick ${state.course && state.course.unstick > 0 ? 1 : 0}`); if (globalThis.__tf.length > 20) globalThis.__tf.shift(); }
      if (state.goingDown && !globalThis.__tfWas) console.error(`FALL at stop ${state.run && state.run.stopId} t=${(step / 3600).toFixed(2)}:\n` + globalThis.__tf.join('\n'));
      globalThis.__tfWas = !!state.goingDown;
    }
    if (state.scorecard && state.scorecard !== playSeen) { playSeen = state.scorecard; play.cards++; play.awards += (state.scorecard.rows || []).length; if (state.scorecard.film) { play.films++; play.filmSecs += state.scorecard.film.clip.len; } } // (L7)
    if (step % 60 === 0 && sim.replay) play.peakKb = Math.max(play.peakKb, sim.replay.stats().bytes / 1024);
    { // (F6: what the stop shape did: counted per stop, per dock)
      const sid = state.run && state.run.stopId, st = sid && state.run.voyage.columns.flat().find((x) => x.id === sid);
      if (sid && sid !== shapeStop) { shapeStop = sid; shape.stops++; if (st && !st.lair && !st.ring && !st.flagship) shape.plain++; }
      if (state.briefing && !shapeSeen.brief) shape.brief++;
      if (state.tempo && state.tempo.phase === 'escape' && !shapeSeen.esc) shape.escape++;
      if (state.tempo && state.tempo.big && !shapeSeen.big) shape.gunship++;
      if (state.boss && state.boss !== shapeSeen.boss && !(st && st.flagship) && !(state.course && state.course.ring && state.course.ring.moor)) shape.midBoss++;
      const v = state.vote && state.vote.kind === 'dock' ? state.vote : null;
      if (v && v !== shapeSeen.vote) { shape.docks++; for (const o of v.options) shape.cards[o.id.replace(/^part-.*/, 'part').replace(/^rebuild-.*/, 'rebuild')] = (shape.cards[o.id.replace(/^part-.*/, 'part').replace(/^rebuild-.*/, 'rebuild')] || 0) + 1; }
      if (v) shape.dockSecs += dt;
      if (state.scorecard || state.vote) shape.menuSecs += dt;
      Object.assign(shapeSeen, { brief: !!state.briefing, esc: !!(state.tempo && state.tempo.phase === 'escape'), big: !!(state.tempo && state.tempo.big), boss: state.boss, vote: v });
    }
    { const rg = state.course && state.course.ring, sid = state.run && state.run.stopId; if (rg && sid) { const e = (ringStops[sid] ??= { stop: sid, variant: rg.variant, t0: step, t1: step, tFell: null, faces: rg.faces.length, down: 0, windows: 0, firstFace: null, attempts: 0, rg: null }); if (e.rg !== rg) { e.rg = rg; e.attempts++; } e.t1 = step; e.down = rg.faces.filter((f) => f.down).length; e.windows = rg.stats.windows; if (e.down && e.firstFace == null) e.firstFace = step; if (rg.crown && e.tFell == null) e.tFell = step; } } // (F12)
    if (state.ship.down > 0 && !wasDown) wrecks.push(String((state.ev && state.ev.warnText) || '?').replace(/ THE (SEA|ROCKS|GROUND)!$/, '!'));
    wasDown = state.ship.down > 0 ? 1 : 0;
    mateStat.max = Math.max(mateStat.max, Object.values(state.players).filter((q) => q.mate).length);
    { const cr = state.creature; if (cr && !lairs.seen.has(cr)) { lairs.seen.add(cr); lairs.met++; } if (cr && cr.dying && cr.stats.win && !lairs.won.has(cr)) { lairs.won.add(cr); lairs.how[cr.stats.win] = (lairs.how[cr.stats.win] || 0) + 1; } } // (C.3: the Kraken lairs the crew met and how they won)
    { const sid = state.run && state.run.stopId; if (sid) { const b = (hullBy[sid] ??= { col: Number(sid.split('.')[0]), hull: 0, n: 0, t0: step, t1: step }); b.t1 = step; if (fl && step % 30 === 0) { b.hull += hullOrStructure(state.ship); b.n++; } } } // (F1)
    if (fl && hullOrStructure(state.ship) < h0) { const dd = damageMul(state); const D = config.SHIP.DRAIN, pf = nf * D.FIRE * dd * D.MUL * dt, pb = nb * D.BREACH * dd * D.MUL * dt, drop = h0 - hullOrStructure(state.ship); dmg.fire += pf; dmg.breach += pb; dmg.direct += Math.max(0, drop - pf - pb); }
  } catch (err) { errorCount++; if (errorCount < 4) console.error('ERR', err && err.stack); }
  if (state.phase === 'lobby' && !state.runEnd && !state.wreck) sim.castOff();
  const stopId = state.run && state.run.stopId;
  if (stopId && stopId !== curveStop) {
    curveStop = stopId;
    const st = state.run.voyage.columns.flat().find((x) => x.id === stopId);
    if (st && !st.harbour && !curve.some((c) => c.id === stopId)) curve.push({ id: stopId, col: st.col, power: state.run.power, exp: st.share != null ? exp(st) : null, danger: st.danger, base: st.base, kind: st.kind, env: st.env, salvage: !!st.salvage, lair: !!st.lair });
  }
  const col = stopId ? Number(stopId.split('.')[0]) : 0;
  if (col !== lastCol && (args.verbose || args.trace)) console.error(`=== stop ${stopId} (${state.env && state.env.id}, ${state.course && state.course.kind}) at ${(step / 3600).toFixed(1)} min, hull ${Math.round(state.ship.hull)} salvage ${state.run.salvage} bought [${state.run.bought.join(",")}]`);
  if (col !== lastCol) { lastCol = col; lastProgress = step; stalled = false; }
  if (args.topup && step - lastProgress > args.stall * 3600 && !stalled) { stalls++; stalled = true; stallInfo.push(snap().stop + ' ' + snap().env + ' ' + snap().mk + ' g' + snap().gas + ' br' + snap().breaches + ' f' + snap().fires); if (args.verbose) console.error('STALL at', JSON.stringify(snap())); }
  if (args.trace && step % (args.trace * 60) === 0) console.error(`t=${(step / 3600).toFixed(2)} dist ${Math.round(state.course.dist)} alt ${Math.round(state.ship.alt)} spd ${state.ship.speed.toFixed(2)} vy ${Math.round(state.ship.vy)} hull ${Math.round(state.ship.hull)} fires ${state.fires.length} br ${state.breaches.length} gh ${(state.gasHoles || []).length} bd ${state.boarders.length} KO ${Object.values(state.players).filter((q) => q.ko > 0).length} boss ${state.boss ? Math.round(state.boss.hp) + '/' + state.boss.maxHp + (state.boss.leaving ? 'L' : '') : '-'} press ${Math.round(state.ship.press)} fuel ${Math.round(state.ship.fuel)} gas ${Math.round(state.ship.gas)} jobs ${Object.entries(Object.values(state.players).reduce((o, q) => { const k = q.ko > 0 ? 'KO' : q.lock ? 'S:' + q.lock : q.botJob ? q.botJob.kind : 'idle'; o[k] = (o[k] || 0) + 1; return o; }, {})).map(([k, v]) => k + v).join(' ')}`);
  if (args.dump && step > args.dump * 3600 && step < args.dump * 3600 + 1200 && step % 120 === 0) console.error("POS " + Object.values(state.players).map((q) => q.name + ":" + (q.botJob && q.botJob.kind) + "@" + q.d + "/" + Math.round(q.x) + (q.carry ? "(" + q.carry + ")" : "")).join(" "));
  if (args.dump && step === args.dump * 3600) { const c0 = state.course, m0 = c0.map, sx0 = c0.dist + 800, sy0 = 500 - state.ship.alt; const sg = c0.stationGun; const stc = sg && maps.stationCell(m0, { x: sg.mx, y: sg.my - 20 }); console.error("HELM", JSON.stringify({ gasValve: state.gasValve, helmP: Object.values(state.players).filter((q) => q.lock === "Helm").map((q) => ({ gas: q.gas, jx: q.jx, jy: q.jy })), mods: (state.modules || []).filter((m) => ["Helm", "Lift", "Boiler", "Helm Pipe", "Lift Pipe"].includes(m.name)).map((m) => [m.name, m.broken, Math.round(m.hp), m.open]), env: state.env, lava: state.lava, ship: state.ship })); console.error("ROUTE", JSON.stringify({ scraping: c0.scraping, contact: c0.lastContact, stuckT: c0.stuckT, unstick: c0.unstick, unstuck: c0.unstuck, stc, fitAt: stc && m0.fit[stc.j * m0.W + stc.i], sx0, sy0, dNow: maps.distToGoal(m0, sx0, sy0), p: maps.routeAhead(m0, sx0, sy0, 7), plan: course.pilotPlan(state, 2.5, 0.55), goal: m0.goal, W: m0.W, H: m0.H, C: m0.CELL, cellDist: m0.dist[Math.floor(sy0 / m0.CELL) * m0.W + Math.floor(sx0 / m0.CELL)] })); }
  if (args.dump && step === args.dump * 3600) console.error(JSON.stringify({ boarders: state.boarders, bots: Object.values(state.players).map((q) => ({ n: q.name, d: q.d, x: Math.round(q.x), y: Math.round(q.y), job: q.botJob && q.botJob.kind, carry: q.carry, ko: q.ko, lock: q.lock, onG: q.onGunship })), bats: (state.bats || []).map((b) => ({ k: b.kind, d: b.d, lx: b.lx, hp: b.hp, latched: b.latched, landed: b.landed, x: Math.round(b.x), y: Math.round(b.y) })), gunship: state.gunship && state.gunship.phase, boss: state.boss && { kind: state.boss.kind, x: Math.round(state.boss.x), hp: state.boss.hp, leaving: state.boss.leaving, flagship: state.boss.flagship }, bossDownLap: state.bossDownLap, lap: state.course.lap, progress: state.course.progress, stopFlagship: state.course.stop && state.course.stop.flagship, tempo: state.tempo && { phase: state.tempo.phase, bossOk: state.tempo.bossOk }, bombBay: state.bombBay, shipBombs: (state.shipBombs || []).length, stationGun: state.course.stationGun, sx: state.course.dist + 800, sy: 500 - state.ship.alt, bayBroken: (state.modules || []).filter((m) => /Bomb/.test(m.name)).map((m) => [m.name, m.broken, m.hp]), ship: state.ship, course: { mapkind: state.course.map && Object.keys(state.course.map), open: state.course.map && state.course.map.open, outposts: state.course.map && state.course.map.outposts && state.course.map.outposts.map((o) => [o.x, o.y, o.done]), unstick: state.course.unstick, dist: state.course.dist, target: state.course.target, done: state.course.done, kind: state.course.kind, lap: state.course.lap }, env: state.env }, (k, v) => (k === 'p' || k === 'obj' ? undefined : v), 1));
  if (args.verbose && step % 3600 === 0) console.error(`min ${step / 3600} hull ${Math.round(state.ship.hull)} ${JSON.stringify(snap())}`);
  if (state.runEnd) {
    const r = state.runEnd;
    const s = snapshot || snap();
    const flags = [];
    if (!r.victory) {
      if (!s.helmManned) flags.push('helmEmpty');
      if (s.gas < 25) flags.push('gasLow');
      if (s.holes >= 4) flags.push('manyHoles');
      if (s.press < 20) flags.push('noPressure');
      if (s.leaks > 5) flags.push('steamLeaks');
      if (s.boarders >= 2) flags.push('raiders');
      if (s.koCount >= 3) flags.push('crewKO');
      if (s.fires >= 3) flags.push('fires');
      if (s.fuel < 10) flags.push('noCoal');
      if (s.flood > 0.5) flags.push('flooded');
      if (!flags.length) flags.push('hullShot');
    }
    const hp = rolling.flying ? Math.round((100 * rolling.helmEmpty) / rolling.flying) : 0;
    const avg = (v) => (rolling.flying ? +(v / rolling.flying).toFixed(1) : 0); const crew = Object.fromEntries(Object.entries(rolling.crew).map(([k, v]) => [k, Math.round((100 * v) / rolling.n)]));
    result = { earned: state.run.earned, parts: (state.run.parts || []).map((p) => p.id), mates: mateInfo(), avg: { br: avg(rolling.br), fires: avg(rolling.fires), gh: avg(rolling.gh), crew }, seed: args.seed, done: r.done, total: r.total, victory: r.victory, minutes: step / 3600, stalls, stallInfo, errors: errorCount, flags,
      cause: r.victory ? 'flagship down' : `dmg fire ${Math.round(dmg.fire)} breach ${Math.round(dmg.breach)} direct ${Math.round(dmg.direct)} | stop ${r.reached} ${s.env} | helm ${s.helmManned ? 'manned' : s.helmBroken ? 'BROKEN' : 'EMPTY'} (empty ${hp}% of run) gas ${s.gas} holes ${s.holes} press ${s.press} fuel ${s.fuel} leaks ${s.leaks} raiders ${s.boarders} KO ${s.koCount} fires ${s.fires} broken [${s.broken.join(',')}] clog ${s.clog} o2 ${s.o2} flood ${s.flood} [${flags.join(',')}]` };
  }
}
if (!result) {
  const stopId = state.run.stopId;
  result = { earned: state.run.earned, parts: (state.run.parts || []).map((p) => p.id), mates: mateInfo(), seed: args.seed, done: Number(stopId.split('.')[0]), total: state.run.voyage.columns.length, victory: false, timeout: true, minutes: args.maxmin, stalls, stallInfo, errors: errorCount, groundedAtEnd: !!state.grounded, flags: [], cause: `still flying at stop ${stopId}: ${JSON.stringify(snap())}` };
}
result.curve = curve;
result.nemesis = state.run.nemesis ? { meetings: state.run.nemesis.meetings, escapes: state.run.nemesis.escapes, ours: state.run.nemesis.ours, slain: state.run.nemesis.slain ? 1 : 0, final: state.run.nemesis.final ? 1 : 0 } : null; // (L4)
result.hullBy = Object.values(hullBy); // (F1: { col, hull, n, t0, t1 } per stop reached)
result.fun = fun.result(); // (FUN.md F8)
result.shape = shape; // (F6)
result.play = play; // (L7)
result.ringStops = Object.values(ringStops).map(({ rg, ...x }) => x); // (F12)
result.profile = args.profile;
result.offers = state.run.offers || { lair: [], salvage: [], taken: [] }; // (G0: the lairs and salvage runs the route votes offered, and the stops the crew took)
{ const G = state.goals && state.goals.stats, D = state.groundSys && state.groundSys.der && state.groundSys.der.stats, R = state.run.derelict; if (G || D || R) result.derelict = { goals: G ? { ...G } : null, wrecks: D ? { ...D } : null, run: R ? { boarded: R.boarded, stripped: R.stripped, hauled: R.hauled, named: R.named, pending: R.pending.length, won: R.won, lost: R.lost, defendWon: R.defendWon, defendLost: R.defendLost } : null }; } // (LOOP.md G5 / G6: the wrecks stripped, the named parts bought, the salvage runs and DEFEND stops won and lost)
{ const S = state.scrapStats; if (S && config.SCRAP.ENABLED && !config.PVP.ENABLED) result.scrap = { spawned: S.spawned, landed: S.landed, hooked: S.hooked, stowed: S.stowed, lost: S.lost, taken: S.taken, hulks: S.hulks, dumped: S.dumped, by: S.by, holdSum: S.holdSum, holdN: S.holdN, carrySecs: S.carrySecs, crewSecs: S.crewSecs, patched: S.patched | 0, spent: S.spent | 0, built: S.built | 0, patchSaves: (state.structStats && state.structStats.patchSaves) | 0 }; } // (G2: patches riveted, bundles paid at the docks, parts and fittings built with some, held segments saved) (SCRAP, LOOP.md G1: what fell, what was caught and stowed over the voyage)
result.frames = { bought: (state.run.bought || []).filter((id) => String(id).startsWith('frame-')).length, built: (state.run.parts || []).filter((q) => q.frame).length, bundles: (state.scrapStats && state.scrapStats.framed) | 0, open: ((state.run.frames) || []).filter((f) => !f.done).length }; // (G4: parts bought as frames, built from them, bundles carried into frames, frames still waiting at the end)
result.lairs = { planned: state.run.voyage.columns.flat().filter((s) => s.lair).length, met: lairs.met, won: lairs.won.size, how: lairs.how }; // (C.3)
result.wrecks = wrecks; result.struct = state.structStats ? { ...state.structStats } : null; // (balance pass: every wreck's cause, and the structure counters: falls, saves, crashes, failures, splits)
result.breaks = state.breakStats ? state.breakStats.events : 0; // (S.5i: how often parts broke off in this voyage, and what did it)
result.breakCauses = state.breakStats && state.breakStats.causes ? state.breakStats.causes.map((c) => c.split('@')[0]) : [];
console.log('RESULT ' + JSON.stringify(result));
