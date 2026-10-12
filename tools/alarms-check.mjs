// ONE VOICE gate (FUN.md F2; host/alarms.js, config.ALARMS). Headless.
//   node tools/buildsim.mjs --check-alarms        or directly:   node tools/alarms-check.mjs [--seed 1] [--minutes 4]
//
//   1  the arbiter on a stub banner: a lower priority waits, an equal one replaces only after HOLD, priority >= PREEMPT (FALLING, a crash) cuts in at once, a cut-off banner that still matters comes back
//   2  the queue: sorted by priority then arrival, at most QUEUE long (the lowest and newest is dropped), stale ones are dropped; the same words are merged (on screen and in the queue)
//   3  a random storm of 2000 says: no two banners within HOLD (a banner shorter than that protects itself for its own length) except one of priority >= PREEMPT
//   4  the real game: GOING DOWN / FALLING over a busy banner is on screen the same step (< 0.1 s)
//   5  the real game, 8 bots, N minutes: the same banners said with the arbiter on and off - how many banners were read (shown their time) and how many were cut off, the longest priority >= PREEMPT waited
//   6  the phone's one line: only an alarm that concerns the player's deck or seat (or a PHONE_ALL kind), the most urgent of them; PHONE_ONE_LINE off = none
//   7  a grep: 0 direct state.ev.warn / warnText writes under public/ outside alarms.js (readers are fine)
//   8  ENABLED = false is the old banner: the last writer wins, nothing queues
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const seed = Number(flag('seed', 1));
const minutes = Number(flag('minutes', 4));
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
let clock = seedRandom(seed);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createAlarms } = await load('modules/host/alarms.js');
const A = config.ALARMS;
const DT = 1 / 60;
config.ALARMS.ENABLED = true; // (a NO_ALARMS=1 environment must not make this check vacuous)

// A stub world with just the banner, and its arbiter.
function stub() {
  const world = { ev: { t: 0, warn: 0, warnText: '' } };
  const al = createAlarms({ world });
  world.ev.log = [];
  const run = (s) => { for (let i = 0, n = Math.round(s / DT); i < n; i++) al.tick(DT); };
  return { world, ev: world.ev, say: world.say, run, al };
}

// ---------------------------------------------------------------- 1. the rules on a stub
{
  const w = stub();
  w.say('info', 'LOW ONE', null, 3);
  w.run(0.5);
  w.say('objective', 'MIDDLE ONE', null, 4);
  report(w.ev.warnText === 'LOW ONE' && w.ev.q.length === 1, 'a higher priority (< PREEMPT) inside HOLD waits: banner "' + w.ev.warnText + '", ' + w.ev.q.length + ' waiting');
  w.run(A.HOLD - 0.5 - 0.1);
  report(w.ev.warnText === 'LOW ONE', 'still waiting just before HOLD is over');
  w.run(0.2);
  report(w.ev.warnText === 'MIDDLE ONE' && w.ev.q.length === 0, 'once HOLD is over the waiting higher one takes over: "' + w.ev.warnText + '"');
  w.run(A.HOLD + 0.1);
  w.say('info', 'A LOWER ONE', null, 3);
  report(w.ev.warnText === 'MIDDLE ONE' && w.ev.q.length === 1, 'a lower priority waits behind a banner even after its HOLD (it is still up)');
  w.run(4);
  report(w.ev.warnText === 'A LOWER ONE', 'and is said when the banner is gone: "' + w.ev.warnText + '"');
  w.run(5);
  w.say('helm', 'ONE', null, 4);
  w.run(A.HOLD + 0.1);
  w.say('helm', 'TWO (EQUAL)', null, 4);
  report(w.ev.warnText === 'TWO (EQUAL)', 'an equal priority replaces a banner whose HOLD is over');
  w.say('helm', 'THREE (EQUAL)', null, 4);
  report(w.ev.warnText === 'TWO (EQUAL)' && w.ev.q.length === 1, 'but not one that has only just come up');
  w.run(10);
  w.say('info', 'BUSY', null, 4);
  w.run(0.2);
  w.say('falling', 'FALLING!', null, 4);
  report(w.ev.warnText === 'FALLING!' && w.ev.warn > 3.9, 'priority ' + A.PRI.falling + ' cuts in at once, the same step (warn ' + w.ev.warn.toFixed(2) + ')');
  w.say('crash', 'CRASH!', null, 4);
  report(w.ev.warnText === 'CRASH!', 'a crash (' + A.PRI.crash + ') cuts in over FALLING');
  w.say('falling', 'FALLING AGAIN!', null, 4);
  report(w.ev.warnText === 'CRASH!' && w.ev.q.some((q) => q.text === 'FALLING AGAIN!'), 'FALLING does not cut off a crash that has only just come up; it waits');
  w.run(10);
  w.run(20);
  // a banner that still matters comes back after a cut-in
  w.say('structure', 'STRUCTURE FAILING', null, 6);
  w.run(0.3);
  w.say('falling', 'GOING DOWN!', null, 3);
  const back = w.ev.q.some((q) => q.text === 'STRUCTURE FAILING');
  w.run(3.5);
  report(back && w.ev.warnText === 'STRUCTURE FAILING', 'what a cut-in pushed off (priority >= 6, time left) is said again afterwards');
}

// ---------------------------------------------------------------- 2. the queue
{
  const w = stub();
  w.say('fire', 'ON SCREEN', null, 6);
  w.run(0.2);
  w.say('info', 'I1', null, 3); w.say('objective', 'O1', null, 3); w.say('helm', 'H1', null, 3);
  report(w.ev.q.map((q) => q.text).join() === 'H1,O1,I1', 'waiting order is by priority: ' + w.ev.q.map((q) => q.text).join());
  w.say('info', 'I2', null, 3);
  report(w.ev.q.length === A.QUEUE && !w.ev.q.some((q) => q.text === 'I2'), 'at most ' + A.QUEUE + ' wait; the lowest and newest is dropped (I2 was)');
  w.say('objective', 'O2', null, 3);
  report(w.ev.q.length === A.QUEUE && w.ev.q.map((q) => q.text).join() === 'H1,O1,O2', 'a higher one pushes the lowest out: ' + w.ev.q.map((q) => q.text).join());
  w.say('objective', 'O1', null, 5);
  report(w.ev.q.length === A.QUEUE && w.ev.q.filter((q) => q.text === 'O1').length === 1, 'the same words in the queue are one message');
  w.say('fire', 'ON SCREEN', null, 6);
  report(w.ev.q.length === A.QUEUE && w.ev.shown === 1, 'the same words as the banner on screen are not queued again (and not shown twice)');
  w.say('fire', 'ON SCREEN - AND MORE', null, 6);
  report(w.ev.warnText === 'ON SCREEN - AND MORE' && w.ev.shown === 1, 'the same words with more after them extend the banner on screen');
  w.run(A.STALE + 1);
  report(w.ev.q.length === 0, 'waiting banners are dropped once stale (' + A.STALE + ' s)');
}

// ---------------------------------------------------------------- 3. a storm of says
{
  const w = stub();
  let r = 12345;
  const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
  const kinds = Object.keys(A.PRI);
  let t = 0;
  for (let i = 0; i < 2000; i++) {
    const kind = kinds[(rnd() * kinds.length) | 0];
    w.say(kind, 'MSG ' + ((rnd() * 40) | 0), null, 1 + rnd() * 5);
    const gap = rnd() * 1.2;
    w.run(gap); t += gap;
  }
  const log = w.ev.log;
  let bad = 0, worst = 1e9, n = 0;
  for (let i = 1; i < log.length; i++) {
    if (log[i].pri >= A.PREEMPT) continue;
    const gap = log[i].t - log[i - 1].t, need = Math.min(log[i - 1].hold, A.HOLD);
    n++;
    worst = Math.min(worst, gap - need);
    if (gap < need - 1e-6) bad++;
  }
  report(log.length > 100 && bad === 0, 'storm: ' + log.length + ' banners in ' + Math.round(t) + ' s, ' + n + ' follow one; ' + bad + ' came inside the HOLD of the one before (priority >= ' + A.PREEMPT + ' excepted)');
}

// ---------------------------------------------------------------- 4/5. the real game
const { createSimulation } = await load('modules/host/simulation.js');
const { BUILDS } = await load('modules/host/shipBuild.js');
const { applyBuild } = await load('shipLayout.js');
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const errors = [];
function boot(enabled, bots = 8) {
  config.ALARMS.ENABLED = enabled;
  config.MAPS.FORCE_KIND = null;
  config.ENVIRONMENTS.FORCE = null;
  clock = seedRandom(seed);
  applyBuild(BUILDS.classic);
  const sim = createSimulation();
  const st = sim.state;
  st.difficulty = 'normal';
  const e = st.ships[0].layout.boarderEntryPoints;
  for (let i = 0; i < bots; i++) {
    const id = 'bot' + i;
    st.players[id] = { id, bot: true, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + 25 * i, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  }
  sim.castOff();
  return { sim, st };
}
function step(sim, n = 1, each = null) {
  for (let i = 0; i < n; i++) {
    clock.ms += DT * 1000;
    try { sim.update(DT); } catch (e) { errors.push(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)); if (errors.length > 4) throw e; }
    if (each && each(i) === 'stop') break;
  }
}
{
  const { sim, st } = boot(true);
  step(sim, 60 * 6);
  st.say('setpiece', 'A BUSY BANNER', null, 4);
  step(sim, 6);
  const gd = st.ships[0].sim.goingDown;
  const started = gd.startFall();
  report(started && /FALLING|GOING DOWN/.test(st.ev.warnText) && st.ev.warn > 3.9, 'GOING DOWN! over a busy banner is on screen the same step: "' + st.ev.warnText + '" (warn ' + st.ev.warn.toFixed(2) + ')');
}

// the same game, banners counted: arbiter off (the old last writer) and on
function play(enabled) {
  const { sim, st } = boot(enabled);
  const orig = st.say;
  const stat = { says: 0, shownN: 0, cut: 0, read: 0, pend: new Map(), maxWait: 0, waitN: 0, urgent: 0 };
  let cur = null; // { text, since } the banner on screen now
  const closeCur = (now, cut) => { if (cur && cut && now - cur.since < Math.min(cur.hold, A.HOLD) - 1e-6) stat.cut++; else if (cur) stat.read++; };
  let t = 0;
  Object.defineProperty(st, 'say', { value: (kind, text, pri, hold, at) => {
    stat.says++;
    const p = pri != null ? pri : A.PRI[kind] != null ? A.PRI[kind] : A.PRI.info;
    const res = orig(kind, text, pri, hold, at);
    if (p >= A.PREEMPT) { stat.urgent++; if (st.ev.warnText !== text || !(st.ev.warn > 0)) stat.pend.set(text, t); }
    return res;
  }, enumerable: false, configurable: true, writable: true });
  const total = Math.round(minutes * 60 * 60);
  let wrecks = 0;
  for (let i = 0; i < total; i++) {
    step(sim, 1);
    t = i / 60;
    const ev = st.ev;
    if (ev.warn > 0 && (!cur || cur.text !== ev.warnText)) { // a banner came up (or replaced the one before)
      closeCur(t, true);
      cur = { text: ev.warnText, since: t, hold: ev.warn };
      stat.shownN++;
    } else if (!(ev.warn > 0) && cur) { closeCur(t, false); cur = null; }
    for (const [text, at] of stat.pend) if (ev.warnText === text && ev.warn > 0) { stat.maxWait = Math.max(stat.maxWait, t - at); stat.waitN++; stat.pend.delete(text); }
    for (const [text, at] of stat.pend) if (t - at > 30) stat.pend.delete(text);
    if (st.ship.down > 0 && !(wrecks > 0)) wrecks = 1;
  }
  stat.fp = [st.kills, Math.round(st.ship.hull * 100), Math.round(st.scroll)].join('/');
  return stat;
}
const off = play(false);
const on = play(true);
const per = (n) => (n / minutes).toFixed(1);
console.log(`INFO ${minutes} min, 8 bots, seed ${seed}: arbiter OFF: ${off.says} says, ${per(off.shownN)} banners/min, ${off.cut} cut off before ${A.HOLD} s (${per(off.cut)}/min), ${off.read} read; ON: ${on.says} says, ${per(on.shownN)} banners/min, ${on.cut} cut off (${per(on.cut)}/min), ${on.read} read; priority >= ${A.PREEMPT}: ${on.urgent} said, longest wait ${on.maxWait.toFixed(3)} s`);
report(on.fp === off.fp, 'the same game with the arbiter on and off: kills / hull / distance ' + on.fp + ' = ' + off.fp + ' (it is text only)');
report(on.cut <= off.cut && on.cut <= Math.max(2, on.urgent + 1), `with the arbiter on, ${on.cut} banners were cut off short (off: ${off.cut}); only a priority >= ${A.PREEMPT} may`);
report(on.maxWait < 0.1, `the longest a priority >= ${A.PREEMPT} alarm waited: ${on.maxWait.toFixed(3)} s`);
report(errors.length === 0, 'the real game ran with 0 errors' + (errors.length ? ': ' + errors[0] : ''));

// ---------------------------------------------------------------- 6. the phone's one line
{
  config.ALARMS.ENABLED = true;
  const w = stub();
  const p = { d: 2 }, q = { d: 0 };
  w.say('boarders', 'BOARDERS ON THE LOWER DECK!', null, 4, { deck: 2 });
  w.run(0.1);
  report(w.world.alarmPhone(p, 'gun') === 'BOARDERS ON THE LOWER DECK!' && w.world.alarmPhone(q, 'gun') === '', 'a deck alarm reaches the phone on that deck only');
  w.say('helm', 'MOUNTAIN AHEAD - CLIMB!', null, 4, { role: 'helm' });
  report(w.world.alarmPhone(q, 'helm') === 'MOUNTAIN AHEAD - CLIMB!' && w.world.alarmPhone(q, 'gun') === '', 'a seat alarm reaches the phone at that seat (even while it waits its turn)');
  report(w.world.alarmPhone(p, 'helm') === 'BOARDERS ON THE LOWER DECK!', 'on his own deck AND at the helm the more urgent one wins (boarders over the climb)');
  w.say('crash', 'CRASH!', null, 3);
  report(w.world.alarmPhone(q, 'gun') === 'CRASH!', 'a crash / FALLING (PHONE_ALL) reaches every phone');
  config.ALARMS.PHONE_ONE_LINE = false;
  report(w.world.alarmPhone(q, 'gun') === '', 'PHONE_ONE_LINE off: no alarm line');
  config.ALARMS.PHONE_ONE_LINE = true;
}

// ---------------------------------------------------------------- 7. the grep
{
  const hits = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { if (f.name !== 'vendor') walk(p); continue; }
      if (!/\.(js|mjs|html)$/.test(f.name) || f.name === 'alarms.js') continue;
      fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '');
        if (/\bwarnText\s*(\+|-)?=(?!=)/.test(code) || /\bev\.warn\s*(\+|-)?=(?!=)/.test(code)) hits.push(path.relative(publicDir, p).replace(/\\/g, '/') + ':' + (i + 1));
      });
    }
  };
  walk(publicDir);
  report(hits.length === 0, '0 direct state.ev.warn / warnText writes under public/ outside alarms.js' + (hits.length ? ': ' + hits.slice(0, 8).join(', ') : ''));
}

// ---------------------------------------------------------------- 8. the switch
{
  config.ALARMS.ENABLED = false;
  const w = stub();
  w.say('info', 'ONE', null, 3);
  w.say('info', 'TWO', null, 2);
  report(w.ev.warnText === 'TWO' && w.ev.warn === 2 && w.ev.q.length === 0, 'ENABLED = false: the old banner, the last writer wins, nothing queues');
}

console.log(ok ? 'alarms check: PASS' : 'alarms check: FAIL');
process.exit(ok ? 0 : 1);
