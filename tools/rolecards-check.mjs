// ROLE CARDS gate (FUN.md F10; host/roleCards.js, host/jobs.js, controller/help.js, config.CONTROLS.ROLE_CARDS). Headless.
//   node tools/buildsim.mjs --check-role-cards        or directly:   node tools/rolecards-check.mjs [--seed 1]
//
//   1  the verb mapping: every job kind has a verb of its own (GRAB / PATCH / SPRAY / LOAD / STOKE / TAKE THE HELM / HELP ...), a job that needs a fetch first is GRAB, an unknown kind falls back on the first word of the label
//   2  the idle threshold, in the real game: a free crewman with a job shows NO verb before VERB_AFTER s, the verb after it (GRAB until the extinguisher is in hand, then SPRAY), none on a seat, a bot or a crewman who is busy
//   3  only idle players with jobs ever show a verb (every step of a 40 s game with 8 humans)
//   4  the ? card: for every kind of station the phone knows (the PHONE_KIND values in shipSim.js + hijack) the card is that seat's hint from controller/ui.js; free with a job it says YOUR JOB: <verb>; knocked out, carrying, nothing to do
//   5  the page: controller.html has the card and the ? button, ui.js wires them and keeps the F6 briefing toast apart
//   6  the switch: NO_ROLE_CARDS=1 gives the old game - ENABLED false, no p.job.verb, no verb in the phone's job, no verb over a head
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const seed = Number(flag('seed', 1));
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
let clock = seedRandom(seed);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { verbOf, idleVerb, VERBS } = await load('modules/host/roleCards.js');
const { JOB_COLORS } = await load('modules/host/jobs.js');
const { helpFor } = await load('modules/controller/help.js');
const { createSimulation } = await load('modules/host/simulation.js');
const { BUILDS } = await load('modules/host/shipBuild.js');
const { applyBuild } = await load('shipLayout.js');
const R = config.CONTROLS.ROLE_CARDS;
const DT = 1 / 60;
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const errors = [];
const secs = (s) => Math.round(s * 60);
const read = (p) => fs.readFileSync(path.join(publicDir, p), 'utf8');

R.ENABLED = true; // (a NO_ROLE_CARDS=1 environment must not make this check vacuous)

// ---------------------------------------------------------------- 1. the verb mapping
{
  const want = { fire: 'SPRAY', hole: 'PATCH', gas: 'PATCH', repair: 'PATCH', leak: 'PATCH', frame: 'PATCH', ammo: 'LOAD', coal: 'STOKE', helm: 'TAKE THE HELM', revive: 'HELP', help: 'HELP', winch: 'HELP', fight: 'FIGHT', rod: 'GRAB', stow: 'GRAB' };
  const bad = Object.entries(want).filter(([k, v]) => verbOf(k, '', false) !== v);
  report(!bad.length, 'the verb of each kind: ' + Object.entries(want).map(([k, v]) => k + '=' + v).join(' ') + (bad.length ? '  WRONG: ' + bad.map(([k]) => k + '->' + verbOf(k, '', false)).join(', ') : ''));
  const missing = Object.keys(JOB_COLORS).filter((k) => !VERBS[k]);
  report(!missing.length, `every job kind jobs.js can colour has a verb of its own (${Object.keys(JOB_COLORS).length} kinds)${missing.length ? ', missing: ' + missing.join(' ') : ''}`);
  report(verbOf('fire', 'FIRE - Galley', true) === 'GRAB' && verbOf('coal', 'COAL for the Boiler', true) === 'GRAB', 'a job that needs a tool or coal fetched first is GRAB until it is in hand');
  report(verbOf('zzz', 'FIRE UNDER THE BAG', false) === 'SPRAY' && verbOf('zzz', 'HULL HOLE - Bay', false) === 'PATCH' && verbOf('zzz', 'AMMO for Nose Gun', false) === 'LOAD' && verbOf('zzz', 'COAL for the Boiler', false) === 'STOKE' && verbOf('zzz', 'TAKE THE HELM - PUMP', false) === 'TAKE THE HELM' && verbOf('zzz', 'HELP Ann!', false) === 'HELP',
    'an unknown kind falls back on the first word of the label (FIRE -> SPRAY, HULL -> PATCH, AMMO -> LOAD, COAL -> STOKE, TAKE -> TAKE THE HELM, HELP -> HELP)');
  const all = new Set(Object.values(VERBS));
  report(['GRAB', 'PATCH', 'SPRAY', 'LOAD', 'STOKE', 'TAKE THE HELM', 'HELP'].every((v) => all.has(v)), 'the brief\'s verbs are all there: GRAB PATCH SPRAY LOAD STOKE TAKE THE HELM HELP (SHOOT: no job sends a crewman to shoot, so none maps to it; a raider is FIGHT)');
}

// ---------------------------------------------------------------- the real game
function boot({ humans = 0, bots = 0, s = seed } = {}) {
  config.MAPS.FORCE_KIND = 'open';
  config.ENVIRONMENTS.FORCE = 'skyisles';
  config.MATES.ENABLED = false;
  config.PACING.RATE_START = config.PACING.RATE_END = config.PACING.PEAK_RATE = 0;
  config.PACING.BUILD = 1e6; config.SPECIALS.FIRST_AFTER = 1e9; config.PACING.GUNSHIP_FIRST = 1e9;
  clock = seedRandom(s);
  applyBuild(BUILDS.classic);
  const sim = createSimulation();
  const st = sim.state;
  const ours = st.ships[0];
  const e = ours.layout.boarderEntryPoints;
  for (let i = 0; i < humans + bots; i++) {
    const id = 'p' + i, bot = i >= humans;
    st.players[id] = { id, bot, name: 'Crew' + (i + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + 25 * i, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true, ko: 0, lock: null, carry: null };
  }
  sim.castOff();
  return { sim, st, ours };
}
function step(sim, n = 1, each = null) {
  for (let i = 0; i < n; i++) {
    clock.ms += DT * 1000;
    try { sim.update(DT); } catch (e) { errors.push(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)); if (errors.length > 4) throw e; }
    if (each && each(i) === 'stop') break;
  }
}
const free = (t, p, d, x) => { const pl = t.ours.layout.platforms[d]; Object.assign(p, { fall: false, lock: null, d, x, y: pl.y, conn: null, ko: 0, freeT: 0, job: null, jobT: 0 }); };

// ---------------------------------------------------------------- 2. the idle threshold
{
  const t = boot({ humans: 3, bots: 1 });
  step(t.sim, secs(3));
  const [a, b, c] = Object.values(t.st.players);
  const bot = Object.values(t.st.players).find((p) => p.bot);
  const main = t.ours.layout.deckIndex('main');
  const ui = (p) => t.ours.sim.jobFinder.ui(p);
  t.st.fires.length = 0; t.st.breaches.length = 0;
  free(t, a, main, 700); free(t, b, main, 760); free(t, c, main, 820);
  // c sits at a station: busy, so no verb and the free clock stays 0
  const seatName = t.ours.layout.stations[0].n;
  t.sim.fire.ignite(main, 900, 'hit'); // a job to point at
  step(t.sim, secs(R.VERB_AFTER - 1));
  report(!!a.job && !idleVerb(a) && a.freeT < R.VERB_AFTER, `free ${a.freeT.toFixed(1)} s (< ${R.VERB_AFTER}) with a job (${a.job && a.job.label}): no verb over his head yet`);
  step(t.sim, secs(2));
  const v = idleVerb(a);
  report(a.freeT > R.VERB_AFTER && v === 'GRAB', `free ${a.freeT.toFixed(1)} s: the verb shows - GRAB (the extinguisher first): ${v}`);
  const u = ui(a);
  report(!!u && u.verb === 'GRAB', `the phone's job carries the verb too: ${u && u.verb}`);
  a.carry = 'extinguisher';
  step(t.sim, secs(1));
  report(idleVerb(a) === 'SPRAY', `with the extinguisher in hand it is SPRAY: ${idleVerb(a)} (${a.job && a.job.label})`);
  // busy -> gone
  a.lock = seatName; a.d = t.ours.layout.stations[0].d; a.x = t.ours.layout.stations[0].x;
  step(t.sim, 10);
  report(!idleVerb(a) && a.freeT === 0 && !a.job, 'a crewman who takes a station loses the verb and his free clock at once');
  report(!idleVerb(bot) && !bot.job, 'a bot never shows a verb');
  report(idleVerb({ bot: true, job: { verb: 'GRAB' }, freeT: 99 }) === null && idleVerb({ job: { verb: 'GRAB' }, freeT: 99, connected: false }) === null && idleVerb({ job: null, freeT: 99 }) === null && idleVerb({ job: { verb: 'GRAB' }, freeT: R.VERB_AFTER }) === null && idleVerb({ job: { verb: 'GRAB' }, freeT: R.VERB_AFTER + 0.01 }) === 'GRAB',
    `idleVerb: not for a bot, a dropped phone or a crewman with no job; not at exactly ${R.VERB_AFTER} s, yes just after`);

  // ------------------------------------------------------------ 3. only idle players with jobs
  const g = boot({ humans: 8 });
  step(g.sim, secs(2));
  const hs = Object.values(g.st.players);
  const mainD = g.ours.layout.deckIndex('main');
  hs.forEach((p, i) => free(g, p, mainD, 500 + 90 * i));
  g.sim.fire.ignite(mainD, 900, 'hit');
  let shown = 0, wrong = 0, checked = 0;
  step(g.sim, secs(40), () => {
    for (const p of hs) {
      checked++;
      const v2 = idleVerb(p);
      if (v2) { shown++; if (p.bot || !p.job || !(p.freeT > R.VERB_AFTER) || p.lock) wrong++; }
      else if (p.job && p.job.verb && p.freeT > R.VERB_AFTER && !p.bot && !p.lock && p.connected !== false) wrong++; // (it should have shown)
    }
  });
  report(shown > 0 && wrong === 0, `40 s, 8 humans, a fire on the deck: the verb showed on ${shown} player-frames, ${wrong} wrong (shown to a bot / without a job / early, or hidden when idle with a job)`);
  report(errors.length === 0, `0 errors in all of the above${errors.length ? ': ' + errors[0] : ''}`);
}

// ---------------------------------------------------------------- 4. the ? card
{
  const ui = read('modules/controller/ui.js');
  const sh = read('modules/host/shipSim.js');
  const hintsSrc = (/const SEAT_HINTS = \{([\s\S]*?)\n  \};/.exec(ui) || [])[1] || '';
  const hints = {};
  for (const m of hintsSrc.matchAll(/^\s+(\w+): '((?:[^'\\]|\\.)*)'/gm)) hints[m[1]] = m[2].replace(/\\'/g, "'");
  const pk = (/const PHONE_KIND = \{([^}]*)\}/.exec(sh) || [])[1] || '';
  const kinds = [...new Set([...pk.matchAll(/:\s*'(\w+)'/g)].map((m) => m[1]).concat(['gun', 'light', 'escort', 'hijack']))];
  const lacking = kinds.filter((k) => !hints[k]);
  report(kinds.length >= 12 && !lacking.length, `SEAT_HINTS has a line for each of the ${kinds.length} kinds of station (${kinds.join(' ')})${lacking.length ? ', missing: ' + lacking.join(' ') : ''}`);
  const wrong = kinds.filter((k) => { const c = helpFor({ locked: true, kind: k, station: 'Seat ' + k }, hints); return c.title !== 'Seat ' + k || c.text !== hints[k] || !c.icon; });
  report(!wrong.length, 'the ? card at a station = that seat\'s hint under the seat\'s name' + (wrong.length ? ', wrong: ' + wrong.join(' ') : ''));
  const job = helpFor({ locked: false, job: { label: 'COAL for the Fore Boiler', dir: 'left', kind: 'coal', verb: 'STOKE' } }, hints);
  report(/^YOUR JOB: STOKE/.test(job.title) && /COAL for the Fore Boiler/.test(job.text) && /GOLD ARROW/.test(job.text), `free with a job: "${job.title}" - "${job.text}"`);
  const ko = helpFor({ ko: 3 }, hints), cc = helpFor({ carry: 'coal' }, hints), ca = helpFor({ carry: 'ammo' }, hints), cx = helpFor({ carry: 'hammer' }, hints), none = helpFor({}, hints);
  report(/revive/i.test(ko.text) && /boiler/i.test(cc.text) && /gun/i.test(ca.text) && /big button/i.test(cx.text) && none.text.startsWith(R.JOIN_TEXT), 'knocked out / carrying coal / ammo / a tool / nothing to do each get their own words (nothing to do = the join card + where to start)');
  report(R.ENABLED === true && /GOLD ARROW/.test(R.JOIN_TEXT) && /big button/.test(R.JOIN_TEXT) && /stick/.test(R.JOIN_TEXT) && /crew/.test(R.JOIN_TITLE), `the join card: "${R.JOIN_TITLE}" "${R.JOIN_TEXT}"`);

  // ---------------------------------------------------------------- 5. the page
  const html = read('controller.html');
  report(/id="hintbtn"/.test(html) && /id="rcard"/.test(html) && /id="rctitle"/.test(html) && /id="rctext"/.test(html) && /#hintbtn\{[^}]*width:44px;height:44px/.test(html), 'controller.html: the ? button (44 px round) and the card');
  report(/'pointerdown'/.test(ui) && /joinCard\(\)/.test(ui) && /helpFor\(uiState, SEAT_HINTS\)/.test(ui) && /joinCarded/.test(ui), 'ui.js: the join card once per page, the ? button asks helpFor with SEAT_HINTS');
  const rend = read('modules/host/render.js');
  report((rend.match(/idleVerb\(p\)/g) || []).length === 2 && /verbTag/.test(rend), 'render.js: the verb is drawn in the 2D view and in the 2D layer over the 3D view (2 sites)');
}

// ---------------------------------------------------------------- 6. the switch
{
  const r = spawnSync(process.execPath, ['-e', "import('" + pathToFileURL(path.join(publicDir, 'config.js')).href + "').then(({config:c})=>console.log(JSON.stringify(c.CONTROLS.ROLE_CARDS.ENABLED)))"], { encoding: 'utf8', env: { ...process.env, NO_ROLE_CARDS: '1' } });
  report((r.stdout || '').trim() === 'false', `NO_ROLE_CARDS=1 gives the old game: ENABLED ${(r.stdout || '').trim()}`);
  R.ENABLED = false;
  const t = boot({ humans: 2 });
  step(t.sim, secs(2));
  const main = t.ours.layout.deckIndex('main');
  const p = Object.values(t.st.players)[0];
  free(t, p, main, 700);
  t.st.fires.length = 0;
  t.sim.fire.ignite(main, 760, 'hit');
  step(t.sim, secs(R.VERB_AFTER + 3));
  const u = t.ours.sim.jobFinder.ui(p);
  report(!!p.job && p.job.verb === undefined && !idleVerb(p) && !!u && !('verb' in u), `ENABLED false: the job is there (${p.job && p.job.label}) but no verb, in the host or in the phone's job`);
}
console.log(ok ? 'role cards check: PASS' : 'role cards check: FAIL');
process.exit(ok ? 0 : 1);
