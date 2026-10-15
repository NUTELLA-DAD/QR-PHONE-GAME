// THE CASTLE OBJECTIVES gate (CASTLE.md package A1; objectives.js, config.AWAY.OBJECTIVES). Headless, seeded.
//   node tools/buildsim.mjs --check-objectives     or directly:  node tools/objectives-check.mjs [--seed 1] [--quick]
//
//   (a) the offer: on by default; at most PER_FACE a face, the same every time, spread over the castle's faces and stops, spaced GAP apart, the ballista only where there is one; NO_AWAY=1 and OBJECTIVES.ENABLED false offer none
//   (b) the 3-player rule: with 2 crew nothing is offered (no marker, no button), with 3 it is; dropping to 2 stands the soldiers down
//   (c) each objective end to end with a staged crewman: the button says what it does and holds, the bar fills, then
//       WINCH     the gate stays open twice as long, its archers are silent, the Book has it, the banner says it
//       CHARGE    needs a powder crate (the keg gives one), a fuse, then the keep's pool (shut) or the core (open); a man too near is knocked out
//       BALLISTA  silent for the stop       BEACON   the revolving guns pause, a supply balloon comes     CAGE   the prisoners walk to the rope, climb it, salvage + a moment
//       BANNER    carried up the rope: the soldiers flee, a trophy card, salvage; dropped when the carrier is knocked out
//   (d) soldiers against a crewman: they notice him, shout "!" (a tell), run, wind up and strike him out cold (the usual KO; he wakes); and the counters: a shove, running, a bomb, a shell
//   (e) the phone: the verb of each job (CRANK PLANT SABOTAGE LIGHT FREE STEAL), the arrow, the hint; the TV alarms go through state.say
//   (f) two ships in one sky: only the main ship's men work objectives and are hunted
//   (g) the bots: a forced trip does each objective end to end; 8 bots on three castles with trips: 0 errors, no NaN
process.env.NO_ALARMS = '1'; // (the checks read the banner text right after an event; (e) puts the arbiter back for a moment)
process.env.NO_DUEL = '1'; // (CASTLE.md A4: these are A1's checks - the squad's strike, the shove; the sword fights have their own gate, tools/duel-check.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';
import { loadBuild } from './buildload.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const seed0 = Number(flag('seed', 1));
const quick = argv.includes('--quick');
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
let clock = seedRandom(seed0);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const { UPGRADE_BLOCKS } = await load('modules/host/upgrades.js');
const { toShipY } = await load('modules/host/pose.js');
const { BUILDS } = await load('modules/host/shipBuild.js');
const { VERBS } = await load('modules/host/roleCards.js');
const OB = config.AWAY.OBJECTIVES, AW = config.AWAY, SO = OB.SOLDIERS;
const DT = 1 / 60;
const copyData = (v) => (Array.isArray(v) ? v.map(copyData) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copyData(x)])) : v);
const UPGRADES0 = copyData(Object.fromEntries(UPGRADE_BLOCKS.map((b) => [b, config[b]])));
const restoreUpgrades = (target, from) => { for (const [k, v] of Object.entries(from)) { if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') restoreUpgrades(target[k], v); else target[k] = copyData(v); } };
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
config.CREATURES.LAIR.COUNT = { short: 0, long: 0 };
config.VOYAGE.CURRICULUM.ENABLED = false;
const KINDS = ['winch', 'charge', 'ballista', 'beacon', 'cage', 'banner'];

// A fresh seeded sim on a ring map: people (h1 ...) and bots, the sky quiet. o.force = the kinds offered on every face (OBJECTIVES.FORCE).
function boot(seed, o = {}) {
  clock = seedRandom(seed);
  restoreUpgrades(config, UPGRADES0);
  config.MAPS.FORCE_KIND = 'ring';
  config.RING.FORCE_VARIANT = o.variant || 'fortress';
  config.PACING.RATE_START = config.PACING.RATE_END = o.pacing ? 1 : 0;
  OB.FORCE = o.force || null;
  const sim = createSimulation();
  const st = sim.state;
  st.difficulty = o.difficulty || 'easy';
  const e = st.ships[0].layout.boarderEntryPoints;
  const mk = (id, bot, i) => (st.players[id] = { id, bot, name: bot ? 'Bot' + (i + 1) : ['Mia', 'Joe', 'Ana', 'Raj'][i] || id, species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + (e[1].x - e[0].x) * ((i + 1) / 6), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true });
  for (let i = 0; i < (o.bots ?? 0); i++) mk('bot' + i, true, i);
  for (let i = 0; i < (o.humans ?? 0); i++) mk('h' + (i + 1), false, i);
  sim.castOff();
  const step = (n = 1) => { for (let i = 0; i < n; i++) { clock.ms += DT * 1000; sim.update(DT); st.ship.hull = 100; } };
  step(60);
  const sh = st.ships[0], REF = sh.layout.refPoint;
  const hold = { x: null, y: null };
  const park = (x, y) => { hold.x = x; hold.y = y; sh.pose.x = x - REF.x; sh.pose.y = y - REF.y; st.ship.vy = 0; st.ship.speed = 0; };
  const stepH = (n = 1) => { for (let i = 0; i < n; i++) { if (hold.x != null) { sh.pose.x = hold.x - REF.x; sh.pose.y = hold.y - REF.y; st.ship.vy = 0; st.ship.speed = 0; } clock.ms += DT * 1000; sim.update(DT); st.ship.hull = 100; } };
  return { sim, st, sh, REF, step, stepH, park, hold, G: st.groundSys, map: () => st.course.map, ring: () => st.course.ring, S: () => st.away, O: () => st.away.obj };
}
const finite = (st) => Object.values(st.players).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) && Number.isFinite(st.ships[0].pose.x) && Number.isFinite(st.ships[0].pose.y);
const moments = (b, kind) => (b.st.moments || []).filter((m) => m.kind === kind);
const said = (b) => String(b.st.ev.warnText || '');
// A person standing on the plaza (the ground, as a landing makes him) at world x.
function stand(b, p, x, face = 0) {
  const f = b.ring().faces[face];
  p.fall = false;
  p.fly = true;
  p.air = false;
  p.conn = null;
  p.lock = null;
  p.ko = 0;
  p.koGrace = 0;
  p.carry = null;
  p.on = { away: true, mode: 'walk', deck: null, gy: f.y, s: 0, edgeT: 0, flareCd: 0, flareT: 0, strand: 0, gone: false, since: 0 };
  p.x = x;
  p.y = f.y;
  p.jx = p.jy = 0;
  return p;
}
// Hold the big button until the objective leaves 'ready' (or n steps): returns the steps it took.
function hold(b, p, ob, n = 400) {
  p.fire = true;
  let i = 0;
  for (; i < n && ob.state === 'ready'; i++) b.stepH(1);
  p.fire = false;
  b.stepH(1);
  return i;
}
const faceObs = (b, face) => b.O().list.filter((q) => q.face === face);
const find = (b, kind, face = null) => b.O().list.find((q) => q.kind === kind && (face == null || q.face === face));

// ---- (a) the offer ----
{
  const b = boot(seed0, { humans: 3 });
  report(OB.ENABLED === true && AW.BOT_TRIPS === false && OB.BOT.DO === true, 'OBJECTIVES are on by default and the bots make no trips by default');
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, ['-e', `import('${pathToFileURL(path.join(publicDir, 'config.js')).href}').then(({config})=>console.log(JSON.stringify([config.AWAY.ENABLED, config.AWAY.OBJECTIVES.ENABLED])))`], { encoding: 'utf8', env: { ...process.env, NO_AWAY: '1' } });
  report((r.stdout || '').trim() === '[false,true]', 'NO_AWAY=1 turns the whole away team off (ENABLED false): ' + (r.stdout || r.stderr || '').trim().slice(0, 40));
  const O = b.O(), m = b.map();
  const per = m.ring.faces.map((f) => O.list.filter((q) => q.face === f.i && !q.sub).length);
  report(per.every((n) => n >= 1 && n <= OB.PER_FACE) && O.stats.offered === per.reduce((a, c) => a + c, 0), `the fortress offers ${O.stats.offered} objectives, ${per.join(' / ')} on its faces (at most ${OB.PER_FACE} each)`);
  const spaced = m.ring.faces.every((f) => { const xs = O.list.filter((q) => q.face === f.i).map((q) => q.x).sort((a, c) => a - c); return xs.every((x, i) => i === 0 || x - xs[i - 1] >= OB.GAP - 1); });
  report(spaced && O.list.every((q) => Math.abs(q.y - m.ring.faces[q.face].y) < 1 && Math.abs(q.x - m.ring.faces[q.face].x) <= 1600), `every spot stands on its face's platform, at least ${OB.GAP} px from the next`);
  const b2 = boot(seed0 + 5, { humans: 3 });
  report(JSON.stringify(b2.O().list.map((q) => [q.kind, q.face, Math.round(q.x)])) === JSON.stringify(b.O().list.map((q) => [q.kind, q.face, Math.round(q.x)])) || b2.st.course.stop.id !== b.st.course.stop.id, 'the same stop offers the same objectives every time (the hash of the stop, the face and the kind)');
  // many stops: every kind turns up, the ballista only where a ballista stands
  const seen = new Set();
  let bad = 0, balNoSpecial = 0;
  for (const variant of ['tower', 'fortress', 'citadel']) {
    const v = boot(seed0, { humans: 3, variant });
    const ring = v.ring();
    for (let k = 0; k < 40; k++) {
      v.st.course.stop = { id: variant + k };
      v.G.obj.begin(v.map());
      const O2 = v.O();
      for (const f of ring.faces) { const own = O2.list.filter((q) => q.face === f.i && !q.sub); if (own.length > OB.PER_FACE || own.length < 1) bad++; }
      for (const q of O2.list) { seen.add(q.kind); if (q.kind === 'ballista' && ring.faces[q.face].special.kind !== 'ballista') balNoSpecial++; }
    }
  }
  report(bad === 0 && balNoSpecial === 0 && KINDS.every((k) => seen.has(k)) && seen.has('keg'), `over 120 stops of three castles every kind is offered (${[...seen].join(' ')}), never more than ${OB.PER_FACE} a face, the ballista only at a ballista`);
  OB.ENABLED = false;
  const off = boot(seed0, { humans: 3 });
  report(off.O().list.length === 0 && off.O().on === false, 'OBJECTIVES.ENABLED false: nothing is offered (the A0 ground)');
  OB.ENABLED = true;
  const src = fs.readFileSync(path.join(publicDir, 'modules/host/objectives.js'), 'utf8');
  report(!/ev\.warn|warnText/.test(src) && /state\.say\('objective'/.test(src) && !/Math\.random/.test(src), 'objectives.js says everything through state.say and draws no random number');
}

// ---- (b) the 3-player rule ----
{
  const two = boot(seed0, { humans: 2, force: ['winch'] });
  const f = two.ring().faces[0];
  two.park(f.x, f.y - 700);
  two.step(30);
  report(two.S().on === false && two.O().on === false, '2 crew aboard: the objectives are not on (nothing to see, nothing to do)');
  const p = stand(two, two.st.players.h1, find(two, 'winch', 0).x);
  two.stepH(5);
  p.fire = true;
  two.stepH(300);
  report(find(two, 'winch', 0).state === 'ready' && !(p.act && p.act.type === 'winch'), 'with 2 crew the Action button does not crank the winch (it is not offered)');
  const three = boot(seed0, { humans: 3, force: ['winch'] });
  const f3 = three.ring().faces[0];
  three.park(f3.x, f3.y - 700);
  three.step(30);
  report(three.S().on === true && three.O().on === true, '3 crew aboard (people and bots counted): the objectives are on');
  const mix = boot(seed0, { humans: 1, bots: 2, force: ['winch'] });
  mix.park(mix.ring().faces[0].x, mix.ring().faces[0].y - 700);
  mix.step(30);
  report(mix.O().on === true, '1 person and 2 bots make 3 crew: on');
  // dropping to 2 crew switches it off and stands the soldiers down
  const q = three.ring().faces[0].squads.find((s) => s.kind === 'plaza');
  const pm = stand(three, three.st.players.h1, q.x + 300);
  three.stepH(40);
  const hunting = !!q.hunt;
  three.st.players.h3.connected = false;
  three.stepH(10);
  report(hunting && three.O().on === false && !q.hunt, `a squad hunting a man stands down when the crew falls to 2 (hunting ${hunting}, then ${!!q.hunt})`);
  void pm;
}

// ---- (c) each objective end to end ----
function hunters(b) { return b.ring().faces.flatMap((f) => f.squads.filter((q) => q.hunt)); }
// a tool: no soldier looks for the man (the objective is what is tested)
const calm = (b) => { for (const f of b.ring().faces) for (const q of f.squads) if (q.kind === 'plaza') q.huntCd = 1e9; };

{ // WINCH (and the real input path: he lands by parachute, walks to it with the stick, holds the button)
  config.ALARMS.ENABLED = true;
  const b = boot(seed0, { humans: 3, force: ['winch'] });
  b.st.ev.log = [];
  const f = b.ring().faces[0], ob = find(b, 'winch', 0), p = b.st.players.h1;
  b.st.alarmClear();
  b.park(ob.x - 2400, f.y - 700);
  b.stepH(20);
  b.sh.sim.air.startFlight(p, 0, 0);
  p.fall = false; p.conn = null; p.lock = null;
  Object.assign(p, { x: ob.x - 300, y: f.y - 300, fvx: 0, fvy: 60, chute: 1, chuteOpen: true });
  p.lsy = p.apex = toShipY(b.sh, p.y);
  for (let i = 0; i < 400 && !p.on; i++) b.stepH(1);
  b.park(f.x, f.y - 700);
  calm(b);
  const posts = f.posts;
  report(!!p.on && p.on.away && Math.abs(p.y - f.y) < 3, 'a parachute lands him on the plaza by the gatehouse');
  p.jx = 1;
  for (let i = 0; i < 400 && Math.abs(p.x - ob.x) > 60; i++) b.stepH(1);
  p.jx = 0;
  b.stepH(3);
  report(p.act && p.act.type === 'winch' && p.act.hold === true && p.act.label === 'CRANK THE GATE WINCH!' && p.act.obj === ob, `at the winch the button says "${p.act && p.act.label}" and is a hold`);
  p.fire = true;
  b.stepH(60);
  const mid = ob.prog;
  report(mid > 0.15 && mid < 0.7 && ob.state === 'ready', `a second of holding fills the bar part way (${mid.toFixed(2)} of ${OB.WINCH.TIME} s)`);
  p.fire = false;
  b.stepH(60);
  report(ob.prog < mid, `let go and it runs back (${ob.prog.toFixed(2)})`);
  const n = hold(b, p, ob);
  report(ob.state === 'done' && f.winch === true, `held ${(n / 60).toFixed(1)} s more: the winch is cranked`);
  report(posts.every((q) => q.hush > OB.WINCH.SILENCE - 3), `...its archer posts are silent for ${OB.WINCH.SILENCE} s (${posts.map((q) => q.hush.toFixed(0))})`);
  b.stepH(240);
  report(b.st.ev.log.some((e) => e.kind === 'objective' && /WINCH/.test(e.text)), `the TV says it, through the alarm arbiter as kind 'objective': "${(b.st.ev.log.find((e) => /WINCH/.test(e.text)) || {}).text}"`);
  report(moments(b, 'away-winch').length === 1 && moments(b, 'away-winch')[0].who[0] === 'Mia', "the Ship's Book has it (away-winch, Mia)");
  config.ALARMS.ENABLED = false;
  const volleys0 = b.ring().gar.stats.volleys;
  for (const q of posts) q.t = 0;
  for (let i = 0; i < 600; i++) b.stepH(1);
  report(f.posts.every((q) => q.mode === 'idle') && b.ring().gar.stats.volleys === volleys0, 'a silent post looses no volley (10 s with the ship in range and its timer at 0)');
  // the shutter stays open twice as long on the cranked face only
  for (const t of b.st.course.turrets) if (t.outpost === 0 || t.outpost === 1) t.dead = true;
  b.stepH(3);
  const f1 = b.ring().faces[1];
  report(Math.abs(f.open - RG().CORE.OPEN_FOR * OB.WINCH.MUL) < 0.2 && Math.abs(f1.open - RG().CORE.OPEN_FOR) < 0.2, `its shutter opens for ${f.open.toFixed(1)} s (${OB.WINCH.MUL} x ${RG().CORE.OPEN_FOR}); the next gate's for ${f1.open.toFixed(1)} s`);
  // the control: the same posts, not silenced, do loose a volley
  const c = boot(seed0, { humans: 3, force: ['winch'] });
  c.park(c.ring().faces[0].x, c.ring().faces[0].y - 700);
  c.step(20);
  for (const q of c.ring().faces[0].posts) q.t = 0;
  c.step(600);
  report(c.ring().gar.stats.volleys > 0, `(control) without the winch the same posts loose ${c.ring().gar.stats.volleys} volley(s) in 10 s`);
  // a man who cranks while a window is open makes it last longer on the spot
  const w = boot(seed0, { humans: 3, force: ['winch'] });
  const wf = w.ring().faces[0], wo = find(w, 'winch', 0), wp = stand(w, w.st.players.h1, wo.x);
  w.park(wf.x, wf.y - 700);
  for (const t of w.st.course.turrets) if (t.outpost === 0) t.dead = true;
  w.stepH(10);
  wf.open = 100;
  calm(w);
  const took = hold(w, wp, wo);
  report(wf.open > 100 - took / 60 + RG().CORE.OPEN_FOR * (OB.WINCH.MUL - 1) - 0.5, `cranking with the shutter open lengthens that window too (100 -> ${wf.open.toFixed(1)} s after ${(took / 60).toFixed(1)} s of cranking)`);
}
function RG() { return config.RING; }

{ // CHARGE
  const b = boot(seed0, { humans: 3, force: ['charge'] });
  const f = b.ring().faces[0], base = find(b, 'charge', 0), keg = find(b, 'keg', 0), p = b.st.players.h1, r = b.ring();
  b.park(f.x, f.y - 700);
  calm(b);
  b.stepH(30);
  stand(b, p, base.x);
  b.stepH(3);
  report(base.x !== keg.x && f.posts.some((q) => q.x === base.x), `the charge stands at the foot of a tower (x ${Math.round(base.x)}), the keg on the plaza (x ${Math.round(keg.x)})`);
  report(p.act && p.act.type === 'need' && /powder/i.test(p.act.label) && base.state === 'ready', `at the tower with empty hands the button says "${p.act && p.act.label}"`);
  p.fire = true;
  b.stepH(300);
  p.fire = false;
  report(base.state === 'ready', 'and holding it does nothing without a crate');
  stand(b, p, keg.x);
  b.stepH(3);
  report(p.act && p.act.type === 'grab' && p.act.hold && p.act.label === 'GRAB THE POWDER KEG', `at the keg: "${p.act && p.act.label}"`);
  p.fire = true;
  for (let i = 0; i < 200 && p.carry !== 'crate'; i++) b.stepH(1);
  p.fire = false;
  report(p.carry === 'crate', 'holding it gives him a powder crate (the existing carry system: a crate)');
  p.x = base.x;
  b.stepH(3);
  report(p.act && p.act.type === 'charge' && p.act.label === 'PLANT THE CHARGE!' && p.act.hold, `with the crate at the tower: "${p.act && p.act.label}"`);
  const keep0 = r.keep.hp, planter = p;
  hold(b, p, base);
  report(base.state === 'fuse' && p.carry === null && Math.abs(base.t - OB.CHARGE.FUSE) < 0.5, `planted: a fuse of ${base.t.toFixed(1)} s, the crate is spent, "${said(b)}"`);
  p.x = base.x + 1300; // runs
  b.stepH(Math.round((OB.CHARGE.FUSE + 1) * 60));
  report(base.state === 'done' && r.stats.breaches.length === 0 && Math.abs((keep0 - r.keep.hp) - OB.CHARGE.BOMBS * RG().CORE.CHIP_BOMB) < 0.01, `the shutter was shut: it hit the keep's pool for ${(keep0 - r.keep.hp).toFixed(1)} (${OB.CHARGE.BOMBS} bombs x ${RG().CORE.CHIP_BOMB})`);
  report(!(planter.ko > 0) && moments(b, 'away-charge').length === 1 && moments(b, 'away-charge')[0].who[0] === 'Mia', "...he ran clear and was not hurt; the Ship's Book has it (away-charge, Mia)");
  // an open shutter: the core takes the hit (or the gate falls)
  const o = boot(seed0, { humans: 3, force: ['charge'] });
  const of = o.ring().faces[0], ob = find(o, 'charge', 0), op = o.st.players.h1;
  o.park(of.x, of.y - 700);
  for (const t of o.st.course.turrets) if (t.outpost === 0) t.dead = true;
  calm(o);
  o.stepH(30);
  stand(o, op, ob.x);
  op.carry = 'ammo'; // (a crate of shells brought from the ship does as well as the keg's)
  o.stepH(3);
  hold(o, op, ob);
  of.open = 60; // (the window the guns' fall opened has closed by now: hold one open)
  const hp0 = of.hp, open0 = of.open;
  op.x = ob.x; // stays: too near
  o.stepH(Math.round((OB.CHARGE.FUSE + 1) * 60));
  report(open0 > 0 && (of.down || hp0 - of.hp >= OB.CHARGE.BOMBS * RG().CORE.BOMB - 0.01), `an open shutter: the core takes ${(hp0 - of.hp).toFixed(1)} (${OB.CHARGE.BOMBS} bombs x ${RG().CORE.BOMB}); ${of.down ? 'THE GATE IS BREACHED' : 'it stands'}`);
  report(op.ko > 0, `a man who stays at the tower is knocked out cold (ko ${op.ko.toFixed(1)} s)`);
  // a breached face makes it fizzle
  const z = boot(seed0, { humans: 3, force: ['charge'] });
  const zf = z.ring().faces[0], zo = find(z, 'charge', 0), zp = z.st.players.h1;
  z.park(zf.x, zf.y - 700);
  calm(z);
  z.stepH(30);
  stand(z, zp, zo.x);
  zp.carry = 'crate';
  hold(z, zp, zo);
  zp.x = zo.x + 1300;
  zf.open = 5;
  z.st.ringSys.hitCore(zf, 99, 'h1', 'bomb'); // (the gate falls to a bomb while the fuse burns)
  const keepZ = z.ring().keep.hp;
  z.stepH(Math.round((OB.CHARGE.FUSE + 1) * 60));
  report(zf.down && zo.state === 'done' && /TOO LATE/.test(said(z)) && z.ring().keep.hp === keepZ && moments(z, 'away-charge').length === 0, `a charge on a gate that already fell fizzles ("${said(z)}")`);
}

{ // BALLISTA
  const ctl = boot(seed0, { humans: 3 });
  const cf = ctl.ring().faces[2];
  ctl.park(cf.x, cf.y - 700);
  ctl.step(10);
  cf.special.t = 0;
  ctl.step(240);
  report(cf.special.kind === 'ballista' && (ctl.ring().gar.stats.bolts > 0 || !!cf.special.lock), '(control) the ballista of the fortress locks on and shoots');
  const b = boot(seed0, { humans: 3, force: ['ballista'] });
  const f = b.ring().faces[2], ob = find(b, 'ballista'), p = b.st.players.h1;
  b.park(f.x, f.y - 700);
  calm(b);
  b.stepH(30);
  f.special.t = 0;
  b.stepH(30);
  stand(b, p, ob.x, 2);
  const lockedBefore = !!f.special.lock || b.ring().gar.stats.bolts > 0;
  b.stepH(3);
  report(ob.face === 2 && ob.x === f.special.x && p.act && p.act.type === 'ballista' && p.act.label === 'SABOTAGE THE BALLISTA!', `the ballista tower is the objective: "${p.act && p.act.label}"`);
  hold(b, p, ob);
  report(ob.state === 'done' && f.special.silent === true && !f.special.lock && moments(b, 'away-ballista').length === 1, `sabotaged: it is silent (silent ${f.special.silent}, lock ${!!f.special.lock}) and the Book has it`);
  const bolts = b.ring().gar.stats.bolts;
  f.special.t = 0;
  b.stepH(900);
  report(b.ring().gar.stats.bolts === bolts && !f.special.lock && lockedBefore !== undefined, `15 s with the ship in range: no lock, no bolt (${b.ring().gar.stats.bolts - bolts} more)`);
}

{ // BEACON
  const b = boot(seed0, { humans: 3, force: ['beacon'] });
  const f = b.ring().faces[0], ob = find(b, 'beacon', 0), p = b.st.players.h1, r = b.ring();
  b.park(f.x, f.y - 700);
  calm(b);
  b.stepH(30);
  const rev = b.st.course.turrets.filter((t) => t.rev && !t.dead);
  const mx0 = rev.map((t) => t.mx);
  b.stepH(60);
  report(rev.length >= 1 && rev.some((t, i) => Math.abs(t.mx - mx0[i]) > 1), `(control) the ${rev.length} revolving guns travel round the ring`);
  stand(b, p, ob.x);
  b.stepH(3);
  report(p.act && p.act.type === 'beacon' && p.act.label === 'LIGHT THE BEACON!', `the beacon: "${p.act && p.act.label}"`);
  b.st.supply = null;
  hold(b, p, ob);
  const mx1 = rev.map((t) => t.mx);
  b.stepH(120);
  report(ob.state === 'done' && rev.every((t) => t.hush > 0) && rev.every((t, i) => t.mx === mx1[i]), `lit: every revolving gun stands still for ${OB.BEACON.PAUSE} s (hush ${rev.map((t) => t.hush.toFixed(0))})`);
  report(rev.every((t) => t.cd >= 0.89 && !t.charging), '...and holds its fire');
  report(!!b.st.supply && /BALLOON/.test(said(b)) && moments(b, 'away-beacon').length === 1, `...a supply balloon comes (${b.st.supply ? 'yes' : 'no'}) and the Book has it: "${said(b)}"`);
  b.stepH(Math.round(OB.BEACON.PAUSE * 60));
  b.stepH(60);
  const mx2 = rev.map((t) => t.mx);
  b.stepH(60);
  report(rev.every((t) => !(t.hush > 0)) && rev.some((t, i) => Math.abs(t.mx - mx2[i]) > 1) && r.beacon === 0, '...then they turn again');
}

// Hang the ship so the rope's foot is near world x (a plaza), the hatch within reach of the ground.
function hover(b, f, x, alt = 640) {
  b.park(x, f.y - alt);
  b.stepH(10);
  const dx = b.S().rope.x - x;
  b.park(x - dx, f.y - alt);
  b.stepH(10);
}

{ // CAGE
  const b = boot(seed0, { humans: 3, force: ['cage'] });
  const f = b.ring().faces[0], ob = find(b, 'cage', 0), p = b.st.players.h1, S = b.S();
  calm(b);
  hover(b, f, ob.x + 500);
  stand(b, p, ob.x);
  b.stepH(3);
  report(p.act && p.act.type === 'cage' && p.act.label === 'FREE THE PRISONERS!', `the cage: "${p.act && p.act.label}"`);
  const salv0 = b.st.run.salvage;
  hold(b, p, ob);
  const O = b.O();
  report(ob.state === 'done' && O.prisoners.length === OB.CAGE.MEN && O.prisoners.every((q) => q.state === 'walk'), `opened: ${O.prisoners.length} prisoners walk to the rope ladder`);
  report(S.pickups.some((q) => q.prisoners) && /PRISONERS/.test(S.pickups.find((q) => q.prisoners).name), 'the helm gets a pickup call for them (the TV marker and the bot helm)');
  for (let i = 0; i < 60 * 40 && O.stats.aboard < OB.CAGE.MEN; i++) b.stepH(1);
  report(O.stats.aboard === OB.CAGE.MEN && S.rope.out !== undefined && b.st.run.salvage - salv0 === OB.CAGE.MEN * OB.CAGE.SALVAGE, `they walked to the rope, climbed it and are aboard: salvage +${b.st.run.salvage - salv0} (${OB.CAGE.MEN} x ${OB.CAGE.SALVAGE})`);
  report(moments(b, 'away-prisoners').length === 1 && moments(b, 'away-prisoners')[0].who[0] === 'Mia', "the Ship's Book has it (away-prisoners, Mia)");
  b.stepH(Math.round((AW.LADDER.KEEP + 2) * 60));
  report(!S.rope.out && finite(b.st), 'the ladder is drawn up after the last one');
}

{ // BANNER
  const b = boot(seed0, { humans: 3, force: ['banner'] });
  const f = b.ring().faces[0], ob = find(b, 'banner', 0), p = b.st.players.h1, S = b.S(), r = b.ring();
  calm(b);
  hover(b, f, ob.x + 700);
  stand(b, p, ob.x);
  b.stepH(3);
  report(p.act && p.act.type === 'banner' && p.act.label === 'STEAL THE GREAT BANNER!', `the banner: "${p.act && p.act.label}"`);
  const sq = f.squads.filter((q) => q.state !== 'dead' && q.kind === 'plaza').length;
  hold(b, p, ob);
  report(ob.state === 'taken' && b.O().banner && b.O().banner.carrier === 'h1', `taken: he carries the great banner ("${said(b)}")`);
  p.jx = 1;
  const x0 = p.x;
  b.stepH(60);
  p.jx = 0;
  report(Math.abs((p.x - x0) - AW.WALK * OB.BANNER.SLOW) < 14, `it is heavy: he walks ${Math.round(p.x - x0)} px a second, not ${AW.WALK}`);
  // to the rope and up it
  S.rope.out || b.G.lowerRope(p);
  b.stepH(10);
  p.x = S.rope.x;
  p.jy = -1;
  b.stepH(3);
  report(p.on && p.on.mode === 'rope', 'stick UP at the foot of the rope: he climbs with the banner');
  for (let i = 0; i < 1500 && p.on; i++) b.stepH(1);
  p.jy = 0;
  const salv0 = b.st.run.salvage;
  report(!p.on && b.O().stats.delivered === 1 && f.routed === true && ob.state === 'done' && !b.O().banner, `back aboard with it: delivered (routed ${f.routed})`);
  report(f.squads.every((q) => q.state === 'dead' || q.state === 'flee') && sq > 0, `that face's soldiers flee (${f.squads.map((q) => q.state).join(' ')})`);
  report(b.st.run.trophy === OB.BANNER.TROPHY && b.st.run.trophyFrom && b.st.run.trophyFrom.name === OB.BANNER.NAME, `a trophy part card waits for the next dock (${b.st.run.trophy}: "${b.st.run.trophyFrom && b.st.run.trophyFrom.name}")`);
  report(b.st.run.gain.away >= OB.BANNER.SALVAGE && moments(b, 'away-banner').length === 1 && moments(b, 'away-banner')[0].who[0] === 'Mia', `salvage +${b.st.run.gain.away} and the Book has it (away-banner, Mia)`);
  void salv0; void r;
  // a trophy already waiting: salvage instead
  const t2 = boot(seed0, { humans: 3, force: ['banner'] });
  t2.st.run.trophy = 'krakenBeak';
  const f2 = t2.ring().faces[0], ob2 = find(t2, 'banner', 0), p2 = t2.st.players.h1;
  calm(t2);
  hover(t2, f2, ob2.x + 700);
  stand(t2, p2, ob2.x);
  hold(t2, p2, ob2);
  t2.G.lowerRope(p2);
  t2.stepH(10);
  p2.x = t2.S().rope.x;
  p2.jy = -1;
  for (let i = 0; i < 1500 && (p2.on || i < 5); i++) t2.stepH(1);
  p2.jy = 0;
  report(t2.st.run.trophy === 'krakenBeak' && t2.st.run.gain.away === OB.BANNER.SALVAGE + OB.BANNER.EXTRA, `with a creature's trophy already waiting the banner pays salvage ${t2.st.run.gain.away} instead and the old card stays`);
  // knocked out with it: it is dropped where he lies, and can be lifted again
  const d = boot(seed0, { humans: 3, force: ['banner'] });
  const df = d.ring().faces[0], dob = find(d, 'banner', 0), dp = d.st.players.h1;
  calm(d);
  d.park(df.x, df.y - 700);
  d.stepH(20);
  stand(d, dp, dob.x);
  hold(d, dp, dob);
  dp.x += 300;
  d.stepH(5);
  dp.ko = 6;
  d.stepH(5);
  report(dob.state === 'ready' && !d.O().banner && Math.abs(dob.x - dp.x) < 30 && d.O().stats.dropped === 1, `knocked out with it: the banner is dropped where he lies (x ${Math.round(dob.x)} / ${Math.round(dp.x)}) and can be lifted again`);
}

// ---- (d) soldiers against a crewman ----
function squadOf(b, face = 0) { return b.ring().faces[face].squads.find((q) => q.kind === 'plaza'); }
{
  const mk = () => {
    const b = boot(seed0, { humans: 3, force: ['winch'] });
    const f = b.ring().faces[0], q = squadOf(b);
    b.park(f.x, f.y - 700);
    b.stepH(40);
    return { b, f, q, st: b.st };
  };
  { // no counter: he is hunted and knocked out
    const { b, f, q, st } = mk();
    const p = stand(b, st.players.h1, q.x + (q.x < f.x ? -380 : 380));
    b.stepH(20);
    const m0 = (st.popups || []).length;
    report(!!q.hunt && q.hunt.phase === 'tell' && q.state === 'cheer' && b.O().stats.noticed === 1, `a plaza squad notices a man ${Math.round(Math.abs(p.x - q.x))} px away: it shouts and points (tell ${q.hunt && q.hunt.phase}, ${q.state})`);
    report((st.popups || []).some((o) => o.text === '!') && /SOLDIERS SPOT/.test(said(b)) && !!p.ui, `...a "!" over the squad, the TV says "${said(b)}", the phone is told`);
    let ph = [], seenRun = false;
    for (let i = 0; i < 60 * 8 && !(p.ko > 0); i++) { b.stepH(1); if (q.hunt && !ph.includes(q.hunt.phase)) ph.push(q.hunt.phase); if (q.state === 'flee' && q.hunt) seenRun = true; }
    report(p.ko > 0 && ph.includes('run') && ph.includes('wind') && seenRun, `it runs at him (phases ${ph.join(' > ')}) and strikes: he is knocked out cold (${p.ko.toFixed(1)} s)`);
    report(b.O().stats.strikes === 1 && b.O().stats.kos === 1 && moments(b, 'away-ko').length === 1 && moments(b, 'away-ko')[0].who[0] === 'Mia', "...counted, and the Book has it (away-ko, Mia)");
    b.stepH(60 * 3);
    report(q.hunt && q.hunt.phase === 'back' || !q.hunt, 'the squad does not hit a man who is down: it goes home');
    for (let i = 0; i < 60 * 12 && q.hunt; i++) b.stepH(1);
    report(!q.hunt && ['muster', 'cheer'].includes(q.state) && Math.abs(q.x - q.home) <= config.GARRISON.SQUAD.SWAY + 1 && q.huntCd > 0, `home again (${q.state}, ${Math.round(q.x - q.home)} px from its post), not looking again for ${Math.round(q.huntCd)} s`);
    for (let i = 0; i < 60 * (config.RAIDERS.KO_TIME + 1) && p.ko > 0; i++) b.stepH(1);
    report(p.ko === 0 && p.hearts >= config.HEALTH.WAKE_HP && p.on && p.on.away && p.koGrace > 0, `he wakes by himself (hearts ${p.hearts}, grace ${p.koGrace.toFixed(1)} s): the usual KO`);
    // a crewmate beside him: the old revive works on the ground too? (it needs a deck - not offered); a second man hunted at once is fine
    report(finite(st), 'nothing went NaN');
  }
  { // a shove
    const { b, f, q, st } = mk();
    const p = stand(b, st.players.h1, q.x + (q.x < f.x ? -380 : 380));
    let shoved = 0, x0 = null;
    for (let i = 0; i < 60 * 14; i++) {
      b.stepH(1);
      if (q.hunt && Math.abs(q.x - p.x) < SO.SHOVE && q.hunt.phase !== 'stun' && !(p.on.shoveCd > 0)) { x0 = q.x; p.atkQ = true; b.stepH(1); if (Math.abs(q.x - x0) > SO.PUSH - 20) shoved++; }
    }
    report(shoved >= 1 && p.ko === 0 && b.O().stats.shoves >= 1 && b.O().stats.kos === 0, `ATTACK shoves the squad ${SO.PUSH} px back and stuns it ${SO.STUN} s: ${b.O().stats.shoves} shoves, he is not hurt`);
    report(!q.hunt && b.O().stats.shoves <= SO.GIVE_UP, `after ${SO.GIVE_UP} shoves they give up and go home (${b.O().stats.shoves} shoves)`);
  }
  { // running away
    const { b, f, q, st } = mk();
    const toward = Math.sign(f.x - q.x) || 1;
    const p = stand(b, st.players.h1, q.x + toward * 300);
    b.stepH(20);
    p.jx = toward;
    p.face = toward;
    const d0 = Math.abs(p.x - q.x);
    b.stepH(60 * 3);
    const d3 = Math.abs(p.x - q.x), hunting = !!q.hunt;
    b.stepH(60 * 2);
    p.jx = 0;
    report(hunting && d3 > d0 && p.ko === 0 && b.O().stats.strikes === 0, `he walks ${AW.WALK} px/s, they run ${SO.SPEED}: after 3 s the gap is ${Math.round(d3)} px (was ${Math.round(d0)}), no strike`);
    for (let i = 0; i < 60 * 12 && q.hunt; i++) b.stepH(1);
    report(!q.hunt && p.ko === 0 && b.O().stats.strikes === 0, 'they run out of leash, give up the chase and go home');
  }
  { // a bomb
    const { b, f, q, st } = mk();
    const p = stand(b, st.players.h1, q.x + (q.x < f.x ? -380 : 380));
    const kills0 = st.kills;
    for (let i = 0; i < 60 * 8 && !(q.hunt && q.hunt.phase === 'run'); i++) b.stepH(1);
    st.shipBombs.push({ x: q.x, y: q.y - 60, vx: 0, vy: 0, owner: 'h2' });
    b.stepH(45);
    report(q.state === 'dead' && !q.hunt || q.state === 'dead', `a bomb on the squad kills it (+${st.kills - kills0} kill) and the hunt is over`);
    b.stepH(120);
    report(p.ko === 0 && b.O().stats.saves === 1 && b.O().stats.kos === 0, `...he is saved (saved ${b.O().stats.saves}, hearts ${p.hearts ?? 'full'})`);
  }
  { // a shell
    const { b, f, q, st } = mk();
    const p = stand(b, st.players.h1, q.x + (q.x < f.x ? -380 : 380));
    for (let i = 0; i < 60 * 8 && !(q.hunt && q.hunt.phase === 'run'); i++) b.stepH(1);
    const n0 = q.n;
    st.shells.push({ x: q.x, y: q.y - 40, vx: 0, vy: 0, life: 1, owner: 'h2', from: 'ship0' });
    b.stepH(2);
    report(q.n === n0 - config.GARRISON.CREW.SHELL_MEN && q.hunt && q.hunt.phase === 'stun', `a shell takes ${config.GARRISON.CREW.SHELL_MEN} men off the squad and staggers the rest (${q.n} left, ${q.hunt && q.hunt.phase})`);
    void p;
  }
  { // out of notice: too far, or on the wall
    const { b, f, q, st } = mk();
    stand(b, st.players.h1, q.x + (q.x < f.x ? -(SO.NOTICE + 120) : SO.NOTICE + 120));
    b.stepH(120);
    report(!q.hunt, `a man ${SO.NOTICE + 120} px away is not noticed`);
    const p = st.players.h1;
    p.on.deck = { y: f.y - 600, x0: f.x - 2000, x1: f.x + 2000, id: 'wall0' };
    p.on.gy = p.y = f.y - 600;
    p.x = q.x;
    b.stepH(120);
    report(!q.hunt, 'a man on the curtain wall above them is not noticed either');
  }
}

// ---- (e) the phone ----
{
  const b = boot(seed0, { humans: 3, force: ['winch', 'charge', 'ballista', 'beacon', 'cage', 'banner'] });
  report(KINDS.every((k) => Object.values(VERBS).length > 0) && VERBS.crank === 'CRANK' && VERBS.plant === 'PLANT' && VERBS.sabotage === 'SABOTAGE' && VERBS.light === 'LIGHT' && VERBS.free === 'FREE' && VERBS.steal === 'STEAL', 'roleCards has the six verbs: CRANK PLANT SABOTAGE LIGHT FREE STEAL');
  const f = b.ring().faces[2];
  b.park(f.x, f.y - 700);
  calm(b);
  b.stepH(20);
  const p = stand(b, b.st.players.h1, f.x - 1550, 2);
  b.stepH(70);
  const j = p.job;
  report(j && j.away && j.dir && ['right', 'left'].includes(j.dir) && j.verb && /^(CRANK|PLANT|SABOTAGE|LIGHT|FREE|STEAL)$/.test(j.verb) && !!p.ui && p.ui.away && p.ui.away.mode === 'walk', `away from the objectives his phone shows the arrow ${j && j.dir} and the verb ${j && j.verb} ("${j && j.label}")`);
  const ids = [];
  for (const ob of b.O().list.filter((q) => q.face === 2 && q.kind !== 'keg')) {
    stand(b, p, ob.x, 2);
    b.stepH(80);
    ids.push(ob.kind + ':' + (p.ui && p.ui.away && p.ui.away.verb) + ':' + (p.act && p.act.hold ? 'hold' : p.act && p.act.type));
  }
  report(ids.length >= 4 && ids.every((s) => /:(CRANK|PLANT|SABOTAGE|LIGHT|FREE|STEAL):(hold|need)$/.test(s)), `at each spot the phone says the verb and the button is a hold (${ids.join(', ')})`);
  const q = f.squads.find((s) => s.kind === 'plaza');
  for (const s of f.squads) s.huntCd = 0;
  stand(b, p, q.x + 300, 2);
  b.stepH(50);
  report(p.ui && p.ui.away && /SOLDIERS/.test(p.ui.away.hint) && p.ui.away.verb === 'RUN', `hunted, his phone says "${p.ui && p.ui.away && p.ui.away.hint}"`);
}

// ---- (f) two ships in one sky ----
{
  clock = seedRandom(seed0);
  restoreUpgrades(config, UPGRADES0);
  config.MAPS.FORCE_KIND = 'ring';
  config.RING.FORCE_VARIANT = 'fortress';
  config.PACING.RATE_START = config.PACING.RATE_END = 0;
  OB.FORCE = ['winch'];
  const sim = createSimulation();
  const parts = await loadBuild('bags', BUILDS);
  const second = sim.addShip(parts);
  const st = sim.state, A = st.ships[0];
  const e = A.layout.boarderEntryPoints, e2 = second.layout.boarderEntryPoints;
  for (let i = 0; i < 3; i++) st.players['a' + i] = { id: 'a' + i, bot: false, name: 'A' + i, species: config.CREW_SPECIES[0], color: colors[i], x: e[0].x + 30 * i, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  st.players.b0 = { id: 'b0', bot: false, name: 'B0', ship: second.id, species: config.CREW_SPECIES[0], color: colors[4], x: e2[0].x, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  sim.castOff();
  const step = (n) => { for (let i = 0; i < n; i++) { clock.ms += DT * 1000; sim.update(DT); } };
  step(120);
  const m = st.course.map, f = st.course.ring.faces[0], REF = A.layout.refPoint;
  const hold2 = () => { A.pose.x = f.x - REF.x; A.pose.y = f.y - 700 - REF.y; A.state.vy = 0; A.state.speed = 0; };
  hold2();
  step(5);
  const ob = st.away.obj.list.find((q) => q.kind === 'winch' && q.face === 0), q = f.squads.find((s) => s.kind === 'plaza');
  for (const s of f.squads) if (s.kind === 'plaza' && s !== q) s.huntCd = 1e9;
  // a man of the second ship in the air over the plaza, near the squad: never noticed, never has the winch
  const b0 = st.players.b0;
  second.sim.air.startFlight(b0, 0, 0);
  b0.fall = false;
  Object.assign(b0, { x: q.x + 200, y: f.y - 200, fvx: 0, fvy: 5 });
  b0.lsy = b0.apex = b0.y - second.pose.y;
  for (let i = 0; i < 120; i++) { hold2(); step(1); }
  report(!q.hunt && !b0.on && st.groundSys.awayList().length === 0, 'a crewman of the second ship near the squad is not noticed and is not an away man');
  const p = st.players.a0;
  Object.assign(p, { fall: false, fly: true, air: false, conn: null, lock: null, ko: 0, koGrace: 0, carry: null, x: ob.x, y: f.y, jx: 0, jy: 0 });
  p.on = { away: true, mode: 'walk', deck: null, gy: f.y, s: 0, edgeT: 0, flareCd: 0, flareT: 0, strand: 0, gone: false, since: 0 };
  p.fire = true;
  for (let i = 0; i < 400 && ob.state === 'ready'; i++) { hold2(); step(1); }
  p.fire = false;
  report(ob.state === 'done' && f.winch === true && st.groundSys.awayList().length === 1, 'with two ships in the sky the main ship\'s man still cranks the winch');
  const p2 = st.players.a0;
  p2.on.shoveCd = 0;
  report(Number.isFinite(p2.x) && Number.isFinite(second.pose.x), 'two ships keep flying: no NaN');
  OB.FORCE = null;
}

// ---- (g) the bots ----
{
  AW.BOT_TRIPS = true;
  OB.BOT.RANGE = 3000;
  const trip = (kind, seed) => {
    const b = boot(seed, { bots: 4, humans: 0, variant: 'fortress', force: [kind] });
    OB.BOT.KIND = kind;
    const face = kind === 'ballista' ? 2 : 0, f = b.ring().faces[face], ob = find(b, kind, face);
    b.park(ob.x + Math.sign(f.x - ob.x || 1) * 400, f.y - 640); // (over the plaza, on the side of the face's middle: the platform ends past the beacon)
    const S = b.S();
    let t = 0, did = false;
    const stat = () => { const s = b.O().stats; return kind === 'winch' ? s.winch : kind === 'charge' ? s.boom : kind === 'ballista' ? s.ballista : kind === 'beacon' ? s.beacon : kind === 'cage' ? s.aboard : s.delivered; };
    for (; t < 60 * 200; t++) {
      b.stepH(1);
      if (stat() >= 1 && S.stats.returns >= 1 && S.stats.trips >= 1 && !b.G.awayList().length) { did = true; break; }
    }
    OB.BOT.KIND = null;
    return { b, did, t, S };
  };
  for (const kind of KINDS) {
    const { b, did, t, S } = trip(kind, seed0 + KINDS.indexOf(kind));
    const bad = Object.values(b.st.players).some((p) => p.on && p.on.away && p.on.mode === 'home');
    report(did && S.stats.homes === 0 && !bad, `a bot trip does the ${kind.toUpperCase()}: done and back aboard in ${(t / 60).toFixed(0)} s (trips ${S.stats.trips}, flares ${S.stats.flares}, walked home ${S.stats.homes})`);
  }
  // 8 bots with trips (every 8 s a bot may go: the sky is busy, the ship hardly ever hangs low over a plaza) on the three castles
  OB.BOT.RANGE = 1100;
  const tripEvery = AW.BOT.TRIP_EVERY;
  AW.BOT.TRIP_EVERY = 8;
  let errors = 0, done = 0, trips = 0, noticed = 0;
  // (1) free flight: the ship goes where the bots fly her, and hardly ever hangs low over a plaza - a trip is rare there
  // (2) held: the ship hangs 640 px over a plaza of the first gate for the whole run (the bots still fight the castle), so the trips come one after the other
  for (const held of quick ? [true] : [false, true]) for (const [variant, seed] of quick ? [['fortress', 3]] : [['tower', 3], ['fortress', 3], ['citadel', 4]]) {
    const minutes = held ? (quick ? 3 : 4) : 4;
    OB.BOT.RANGE = held ? 1700 : 1100;
    const b = boot(seed, { bots: 8, variant, pacing: true, difficulty: 'normal', force: held ? ['winch', 'charge', 'cage', 'banner', 'beacon'] : null });
    config.PACING.RATE_START = config.PACING.RATE_END = 1;
    const f = b.ring().faces[0];
    if (held) { b.park(f.x, f.y - 640); b.stepH(10); b.park(f.x - (b.S().rope.x - f.x), f.y - 640); } // (the rope's foot over the gatehouse, the objectives of the face round it)
    let bad = 0, err = null;
    for (let i = 0; i < minutes * 3600; i++) {
      try { held ? b.stepH(1) : b.step(1); } catch (e) { err = e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e); errors++; break; }
      if (i % 30 === 0 && !finite(b.st)) bad++;
      if (b.st.wreck || b.st.ship.down > 0) b.st.ship.down = 0;
    }
    const s = b.O().stats, n = s.winch + s.boom + s.ballista + s.beacon + s.cage + s.banner;
    done += n;
    trips += b.S().stats.trips;
    noticed += s.noticed;
    report(!err && bad === 0 && b.G.awayList().filter((q) => q.on.mode === 'home').length === 0, `${variant}${held ? ' (held low over a plaza)' : ''}: ${minutes} min, 8 bots with trips: 0 errors, no NaN (${err || 'ok'}); trips ${b.S().stats.trips}, objectives done ${n} (winch ${s.winch}, charge ${s.boom}, ballista ${s.ballista}, beacon ${s.beacon}, cage ${s.cage}, banner ${s.banner}), prisoners aboard ${s.aboard}, soldiers noticed ${s.noticed}, strikes ${s.strikes}, shoves ${s.shoves}`);
  }
  report(errors === 0 && trips >= 1 && done >= 1, `the runs made ${trips} trips and did ${done} objectives between them (soldiers noticed a bot ${noticed} times)`);
  AW.BOT.TRIP_EVERY = tripEvery;
  AW.BOT_TRIPS = false;
}

console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);
