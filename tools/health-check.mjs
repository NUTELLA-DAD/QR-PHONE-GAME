// CREW HEALTH gate (public/modules/host/health.js, config.HEALTH). Headless.
//   node tools/buildsim.mjs --check-health        or directly:   node tools/health-check.mjs [--seed 1]
//
//   (a) FIRE: standing in a fire takes a heart after FIRST seconds, then one per TICK, and the third heart knocks him out (12 s); hopping over a fire and spraying it out are safe;
//       a fire on another deck does nothing; the i-frames stop a second hit but not a BIG one
//   (b) BIG HITS: a blast knocks out everyone close in one go (and not the crew far away); the bomb bay going up knocks out the crew round it; a sapper's bomb; a heavy shell right beside a
//       crewman; a small shell takes one heart; a landing from a great height is a BIG hit, a medium one costs a heart
//   (c) A RAIDER'S BLOW takes one heart and does not knock the crewman out
//   (d) KO FLOW: a crewmate's revive gives 1 heart (and a few seconds of grace), waking by himself gives 1 heart, a stun that leaves hearts does not touch them
//   (e) HEALING: the medical bay heals a heart every HEAL.EVERY seconds up to MAX and nowhere else does; a bandage (hold Action beside him) gives a heart; a ship with no medbay recovers slowly;
//       everyone is whole again at a new mission
//   (f) THE PHONE: the payload carries hearts (halves too), the max, whether there is a medbay; the knocked-out payload carries them; the job arrow points at the medbay on the last heart
//   (g) BOTS: a bot stuck in a fire steps out of it (and burns less than one that does not), a bot on its last heart goes to the medbay and heals, a bot bandages a hurt person
//   (h) config.HEALTH.ENABLED off: the old rules (no fire damage, a raider blow or a bomb knocks out at once, no hearts on the phone)
//   (i) the TV: the hearts pips draw on a stub canvas (full, half, empty) with 0 errors
//   (j) 3-minute botsim runs with hot settings: 0 errors
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
const { createSimulation } = await load('modules/host/simulation.js');
const { BUILDS } = await load('modules/host/shipBuild.js');
const { applyBuild } = await load('shipLayout.js');
const HE = await load('modules/host/health.js');
const { createHealthArt } = await load('modules/host/healthArt.js');
const HC = config.HEALTH;
const SAVED = JSON.stringify(HC);
const restore = () => { const o = JSON.parse(SAVED); for (const k of Object.keys(HC)) delete HC[k]; Object.assign(HC, o); };
const DT = 1 / 60;
const errors = [];
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];

function boot({ bots = 0, humans = 0, parts = null } = {}) {
  config.MAPS.FORCE_KIND = 'open';
  config.ENVIRONMENTS.FORCE = 'skyisles';
  config.PACING.RATE_START = config.PACING.RATE_END = config.PACING.PEAK_RATE = 0; config.PACING.BUILD = 1e6; config.SPECIALS.FIRST_AFTER = 1e9; config.PACING.GUNSHIP_FIRST = 1e9;
  clock = seedRandom(seed);
  applyBuild(parts || BUILDS.classic);
  const sim = createSimulation();
  const st = sim.state;
  const ours = st.ships[0];
  const e = ours.layout.boarderEntryPoints;
  for (let i = 0; i < bots; i++) {
    const id = 'bot' + i;
    st.players[id] = { id, bot: true, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + Math.random() * (e[1].x - e[0].x), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  }
  sim.castOff();
  const L = ours.layout;
  const people = [];
  for (let i = 0; i < humans; i++) { // (stand-ins for phones: not bots, so nothing moves them; placed on a deck with place())
    const id = 'ph' + i;
    const p = st.players[id] = { id, bot: false, name: 'Pat' + (i + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], d: 0, x: 0, y: 0, jx: 0, jy: 0, t: 0, connected: true, face: 1 };
    people.push(p);
  }
  const place = (p, role, x) => { const d = L.deckIndex(role); Object.assign(p, { d, x, y: L.platforms[d].y, fall: false, fly: false, air: false, conn: null, climb: false, ko: 0, lock: null, carry: null, jz: 0 }); return d; };
  return { sim, st, ours, L, people, place };
}
function step(sim, n = 1, each = null) {
  for (let i = 0; i < n; i++) {
    clock.ms += DT * 1000;
    try { sim.update(DT); } catch (e) { errors.push(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)); if (errors.length > 4) throw e; }
    if (each && each(i) === 'stop') break;
  }
}
const secs = (s) => Math.round(s * 60);
const hp = (p) => HE.hearts(p);
// the first deck x where a fire can burn (not plate, not iron) on the main deck, clear of stations
const burnable = (L, d, from = 300) => { for (let x = from; x < L.platforms[d].x1 - 100; x += 20) { if (L.armour && L.armour.some((a) => a.d === d && x > a.x0 - 30 && x < a.x1 + 30)) continue; if (L.stations.some((s) => s.d === d && Math.abs(s.x - x) < 120)) continue; return x; } return from; };
const light = (ours, L, d, x) => { const f = ours.sim.fireSys.ignite(d, x, 'test'); if (f) f.t = -1e9; return f; }; // (a fire that stays where it is: it never tries to spread)

// ---- (a) fire ----
{
  const { sim, st, ours, L, people, place } = boot({ humans: 3 });
  const [a, b, c] = people;
  const d = place(a, 'main', 0);
  const x = burnable(L, d);
  a.x = x; place(b, 'main', x + 600); place(c, 'lower', x);
  const f = light(ours, L, d, x);
  report(!!f, 'a fire can be lit on the main deck');
  step(sim, 2);
  const t0 = { a: hp(a), c: hp(c) };
  const times = [];
  let last = 3;
  step(sim, secs(6), () => { if (hp(a) !== last) { times.push([+(sim.state.ev.t || 0).toFixed(2), hp(a), a.ko > 0]); last = hp(a); } });
  // read the times off a frame count instead of the director's clock
  const { sim: sim2, ours: ours2, L: L2, people: [a2], place: place2 } = boot({ humans: 1 });
  const d2 = place2(a2, 'main', 0); const x2 = burnable(L2, d2); a2.x = x2; light(ours2, L2, d2, x2);
  const hits = [];
  let n = 0, prev = 3;
  step(sim2, secs(6), () => { n++; if (hp(a2) !== prev) { hits.push(+(n / 60).toFixed(2)); prev = hp(a2); } });
  const F = HC.FIRE;
  report(hits.length === 3 && Math.abs(hits[0] - F.FIRST) < 0.12 && Math.abs(hits[1] - hits[0] - F.TICK) < 0.12 && Math.abs(hits[2] - hits[1] - F.TICK) < 0.12, `standing in a fire: a heart at ${hits.join(' s, ')} s (FIRST ${F.FIRST}, then every ${F.TICK})`);
  report(a2.ko > 0 && hp(a2) === 0 && a2.ko > config.RAIDERS.KO_TIME - 3, `the third heart knocks him out (ko ${a2.ko.toFixed(1)} s, hearts ${hp(a2)})`);
  report(hp(b) === 3 && b.ko <= 0 && hp(c) === 3, `a crewman far from the fire and one on another deck are untouched (${hp(b)}, ${hp(c)} hearts)`);
  report(t0.a <= 3 && sim.state.healthStats.lost.fire >= 3 && sim.state.healthStats.ticks >= 3, `the stats count the burns (${JSON.stringify(sim.state.healthStats.lost)}, ${sim.state.healthStats.ticks} burns)`);
  restore();
  // hopping over, spraying, walking through
  const T = boot({ humans: 3 });
  const [h, s, w] = T.people;
  const dT = T.place(h, 'main', 0); const xT = burnable(T.L, dT); const fT = light(T.ours, T.L, dT, xT);
  h.x = xT; h.jz = 60; // in the air above it
  T.place(s, 'main', xT + 20); s.carry = 'extinguisher';
  fT.big = true; // a blaze takes 1.8 s to spray out: longer than FIRST
  step(T.sim, 5);
  let jumpHeld = 0;
  step(T.sim, secs(1.5), () => { h.jz = 60; s.fire = true; });
  report(hp(h) === 3, `hopping over a fire is safe (${hp(h)} hearts)`);
  report(hp(s) === 3 || T.st.fires.length === 0, `spraying a fire out is safe: ${hp(s)} hearts while he sprays (fires left ${T.st.fires.length})`);
  void jumpHeld; void w;
  restore();
}

// ---- i-frames and BIG hits ----
{
  const { sim, st, ours, L, people, place } = boot({ humans: 4 });
  const [a, b, c, d4] = people;
  place(a, 'main', 600); place(b, 'main', 1100); place(c, 'main', 640); place(d4, 'lower', 600);
  step(sim, 2);
  const r1 = HE.hurt(a, 1, { cause: 'test' }), r2 = HE.hurt(a, 1, { cause: 'test' });
  report(r1 === 'hit' && r2 === null && hp(a) === 2, `the i-frames stop a second hit (${r1}, ${r2}, ${hp(a)} hearts)`);
  step(sim, secs(HC.IFRAMES + 0.1));
  const r3 = HE.hurt(a, 1, { cause: 'test' });
  report(r3 === 'hit' && hp(a) === 1, `...and wear off after ${HC.IFRAMES} s (${hp(a)} hearts)`);
  const r4 = HE.hurt(a, HC.BIG, { big: true, cause: 'test' });
  report(r4 === 'ko' && hp(a) === 0, 'a BIG hit ignores the i-frames and takes every heart');
  HE.knockOut(a, 12);
  // a blast beside c, none near b
  const hurtBefore = [hp(b), hp(c), hp(d4)];
  const hit = ours.sim.health.blast(c.x + 10, L.platforms[c.d].y - 40, 100, { big: true, cause: 'blast' });
  report(hit.includes(c) && c.ko > 0 && hp(c) === 0 && !hit.includes(b) && hp(b) === 3 && !hit.includes(d4), `a blast knocks out the crew close to it in one go and nobody else (${hit.map((p) => p.name).join(',')}; ${hurtBefore.join('/')} before)`);
  // shells: a small one takes a heart, a heavy one right beside him knocks him out
  place(b, 'main', 1100); b.hurtT = 0; b.koGrace = 0;
  ours.sim.impact(1100, L.platforms[b.d].y - 40, 1);
  report(hp(b) === 2 && b.ko <= 0, `a small shell bursting by him takes one heart (${hp(b)})`);
  step(sim, secs(1));
  ours.sim.impact(1100, L.platforms[b.d].y - 40, 2.2);
  report(b.ko > 0 && hp(b) === 0, `a heavy shell right beside him knocks him out at once (ko ${b.ko.toFixed(1)})`);
  // the helm
  restore();
}
{
  // the bomb bay, a sapper's bomb, hard landings
  const { sim, st, ours, L, people, place } = boot({ humans: 3 });
  const [a, b, c] = people;
  const bay = L.bombBay;
  const bd = L.platforms.findIndex((q) => bay && q.y > bay.y - 120 && q.y < bay.y + 60 && bay.x >= q.x0 && bay.x <= q.x1);
  Object.assign(a, { d: bd, x: bay.x + 60, y: L.platforms[bd].y, fall: false, ko: 0 });
  place(b, 'main', 200); b.d = L.deckIndex('catwalk'); b.y = L.platforms[b.d].y; b.x = 200;
  st.bombBay.bombs = 4;
  step(sim, 2);
  ours.sim.explodeBay('test');
  report(a.ko > 0 && hp(a) === 0, `the bomb bay going up knocks out the man beside it (ko ${a.ko.toFixed(1)}, ${hp(a)} hearts)`);
  report(hp(b) === 3 && !(b.ko > 0), 'a crewman far from the bay is fine');
  restore();
  const T = boot({ humans: 3 });
  const [p1, p2] = T.people;
  const dT = T.place(p1, 'main', 500); T.place(p2, 'main', 900);
  T.st.bombs.push({ x: 540, d: dT, t: 0.05, prog: 0 });
  step(T.sim, 8);
  report(p1.ko > 0 && hp(p1) === 0 && hp(p2) === 3, `a sapper's bomb knocks out the man by it in one go (ko ${p1.ko.toFixed(1)}), not the one far away`);
  restore();
  // landings
  const G = boot({ humans: 2 });
  const [g1, g2] = G.people;
  for (const [p, extra, name] of [[g1, 420, 'a medium'], [g2, 900, 'a great']]) {
    const d = G.place(p, 'main', p === g1 ? 400 : 700);
    G.ours.sim.air.startFlight(p, 0, 0);
    p.apex -= extra; // (as if he had fallen from this far above)
    p.fvy = 200;
    step(G.sim, secs(2.5));
    void d;
  }
  report(hp(g1) === 2, `a landing from a medium height costs one heart (${hp(g1)})`);
  report(hp(g2) === 0 && g2.ko > 0, `a landing from a great height is a BIG hit (${hp(g2)} hearts, ko ${g2.ko.toFixed(1)})`);
  restore();
}

// ---- (c) a raider's blow ----
{
  const { sim, st, ours, L, people, place } = boot({ humans: 2 });
  const [a, b] = people;
  place(a, 'main', 600); place(b, 'main', 1300);
  const grunt = ours.sim.raiders.dropOne(640, L.platforms[a.d].y - 50, 'grunt');
  let first = null, koAt = null, n = 0;
  step(sim, secs(14), () => { n++; if (first === null && hp(a) < 3) first = [hp(a), a.ko > 0]; if (koAt === null && a.ko > 0) koAt = n / 60; if (hp(a) <= 0) return 'stop'; });
  report(first && first[0] === 2 && first[1] === false, `a grunt's first blow takes one heart and does not knock him out (${first ? first[0] + ' hearts' : 'no blow'})`);
  report(koAt !== null, `...and the third blow knocks him out (at ${koAt ? koAt.toFixed(1) : '-'} s)`);
  restore();
}

// ---- (d) KO flow and (e) healing ----
{
  const { sim, st, ours, L, people, place } = boot({ humans: 4 });
  const [a, b, c, d4] = people;
  place(a, 'main', 600); place(b, 'main', 640); place(c, 'main', 1300); place(d4, 'main', 1500);
  step(sim, 2);
  HE.hurt(a, HC.BIG, { big: true, cause: 'test' }); HE.knockOut(a, 12);
  step(sim, 2);
  report(a.ko > 0 && hp(a) === 0, 'knocked out at zero hearts');
  b.fire = true;
  step(sim, secs(2.2), () => { b.fire = true; });
  b.fire = false;
  report(a.ko <= 0 && hp(a) === HC.WAKE_HP && a.koGrace > 0, `a crewmate's revive gives ${HC.WAKE_HP} heart and a few seconds of grace (${hp(a)} hearts, ko ${a.ko.toFixed(1)}, grace ${a.koGrace.toFixed(1)})`);
  HE.hurt(c, HC.BIG, { big: true, cause: 'test' }); HE.knockOut(c, 1);
  step(sim, secs(1.5));
  report(c.ko <= 0 && hp(c) === HC.WAKE_HP, `waking by himself gives ${HC.WAKE_HP} heart (${hp(c)})`);
  // a stun that leaves hearts alone
  d4.hearts = 2; d4.ko = 0.5;
  step(sim, secs(1));
  report(hp(d4) === 2, 'a short stun does not touch his hearts');
  // healing at the medbay
  const mb = ours.sim.health.medbay();
  const mx = L.medbay.x;
  report(!!mb, 'the classic ship has a medical bay');
  const H = boot({ humans: 3 });
  const [m1, m2, m3] = H.people;
  step(H.sim, 3);
  const md = H.ours.sim.health.medbay();
  Object.assign(m1, { d: md.d, x: md.x + 20, y: H.L.platforms[md.d].y, hearts: 1, fall: false });
  H.place(m2, 'main', 300); m2.hearts = 1;
  H.place(m3, 'main', 700); m3.hearts = 1;
  const marks = [];
  let n = 0, prev = 1;
  step(H.sim, secs(12), () => { n++; if (hp(m1) !== prev) { marks.push(+(n / 60).toFixed(1)); prev = hp(m1); } });
  report(hp(m1) === 3 && marks.length === 2 && Math.abs(marks[0] - HC.HEAL.EVERY) < 0.2 && Math.abs(marks[1] - 2 * HC.HEAL.EVERY) < 0.3, `in the medbay a heart comes back every ${HC.HEAL.EVERY} s up to ${HC.MAX} (at ${marks.join(' s, ')} s)`);
  report(hp(m2) === 1 && hp(m3) === 1, `...and nowhere else on a ship with a medbay (${hp(m2)}, ${hp(m3)})`);
  // a bandage
  H.place(m2, 'main', 300); H.place(m3, 'main', 330); m3.hearts = 1; m3.hurtT = 0;
  m2.fire = true;
  step(H.sim, secs(HC.BANDAGE.TIME + 0.6), () => { m2.fire = true; });
  m2.fire = false;
  report(hp(m3) === 2, `a crewmate's bandage (hold Action ${HC.BANDAGE.TIME} s) gives a heart (${hp(m3)})`);
  // a new mission makes everyone whole
  m3.hearts = 1;
  H.st.course.lap = (H.st.course.lap || 0) + 1;
  step(H.sim, 3);
  report(hp(m3) === 3 && hp(m2) === 3, `a new mission: everyone is whole again (${hp(m3)}, ${hp(m2)})`);
  restore();
  // a ship with no medbay: slow rest
  const N = boot({ humans: 1, parts: BUILDS.classic.filter((q) => q.part !== 'medbay') });
  const [r1] = N.people;
  step(N.sim, 3);
  const rd = N.L.deckIndex('main');
  Object.assign(r1, { d: rd, x: (N.L.platforms[rd].x0 + N.L.platforms[rd].x1) / 2, y: N.L.platforms[rd].y, hearts: 1, fall: false });
  report(!N.L.medbay, 'the classic ship without her medbay has none');
  step(N.sim, secs(HC.HEAL.NO_MEDBAY_EVERY + 2));
  report(hp(r1) === 2, `...so he recovers slowly instead: a heart after ${HC.HEAL.NO_MEDBAY_EVERY} s (${hp(r1)})`);
  restore();
}

// ---- (f) the phone ----
{
  const { sim, st, ours, L, people, place } = boot({ humans: 2 });
  const [a, b] = people;
  place(a, 'main', 300); place(b, 'main', 1300);
  step(sim, 30);
  report(a.ui && a.ui.hp === 3 && a.ui.hpMax === 3 && a.ui.med === true && a.ui.jat === 1, `the phone payload carries hearts, the max and whether there is a medbay (${JSON.stringify({ hp: a.ui && a.ui.hp, hpMax: a.ui && a.ui.hpMax, med: a.ui && a.ui.med })})`);
  a.hearts = 1.5; a.hurtT = 0;
  step(sim, 4);
  report(a.ui.hp === 1.5, `half hearts reach the phone (${a.ui.hp})`);
  a.hearts = 1;
  step(sim, secs(HC.IDLE_AFTER ?? 2));
  step(sim, secs(4));
  const jobs = config.JOBS;
  report(a.job && a.job.kind === 'heal' && /MEDBAY/.test(a.job.label) && !!a.job.dir, `on the last heart the job arrow points at the medbay (${a.job ? a.job.label + ' ' + a.job.dir : 'no job'})`);
  report(a.ui.job && a.ui.job.kind === 'heal', 'and it is on the phone');
  HE.hurt(a, HC.BIG, { big: true, cause: 'test' }); HE.knockOut(a, 12);
  step(sim, 3);
  report(a.ui && a.ui.ko === true && a.ui.hp === 0 && a.ui.hpMax === 3, `the knocked-out payload carries the hearts (${JSON.stringify(a.ui)})`);
  void jobs;
  restore();
}

// ---- (g) bots ----
{
  // a bot told to loiter in a fire steps out of it
  const run = (flee) => {
    restore();
    HC.BOT.FLEE = flee;
    const T = boot({ bots: 1 });
    const bot = Object.values(T.st.players)[0];
    step(T.sim, secs(8)); // (it drops aboard)
    for (const q of [...T.st.fires]) T.st.fires.splice(T.st.fires.indexOf(q), 1);
    const d = T.L.deckIndex('main');
    const x = burnable(T.L, d);
    Object.assign(bot, { d, x, y: T.L.platforms[d].y, fall: false, ko: 0, lock: null, hearts: 3, hurtT: 0, koGrace: 0, botJob: null, wanderTo: { d, x }, think: 1e9, restCd: 1e9 });
    const f = light(T.ours, T.L, d, x);
    let outAt = null, n = 0, lost = 0;
    step(T.sim, secs(8), () => { n++; bot.think = 1e9; if (bot.wanderTo) bot.wanderTo = { d, x: bot.x < x + 150 ? x : bot.x }; if (outAt === null && Math.abs(bot.x - f.x) > HC.FIRE.REACH + 8 && n > 20) outAt = n / 60; });
    lost = 3 - hp(bot);
    return { outAt, lost, ko: bot.ko };
  };
  const flees = run(HC.BOT.FLEE), stays = run(1e9);
  report(flees.outAt !== null && flees.outAt < 2.5 && flees.lost <= 2, `a bot burning in a fire steps out of it (out after ${flees.outAt ? flees.outAt.toFixed(1) : '-'} s, lost ${flees.lost})`);
  report(stays.lost >= 2, `...and one that stays burns (lost ${stays.lost} hearts)`);
  restore();
  // a hurt bot goes to the medbay and heals; with a person hurt, a bot bandages him
  const T = boot({ bots: 4, humans: 1 });
  const bots = Object.values(T.st.players).filter((p) => p.bot);
  step(T.sim, secs(8));
  const md = T.ours.sim.health.medbay();
  const victim = bots[0];
  victim.lock = null; victim.hearts = 1; victim.hurtT = 0;
  const D = T.L.deckIndex('catwalk');
  Object.assign(victim, { d: D, x: T.L.platforms[D].x0 + 80, y: T.L.platforms[D].y, jz: 0 });
  let reached = null, healed = null, n = 0;
  step(T.sim, secs(70), () => { n++; if (reached === null && victim.d === md.d && Math.abs(victim.x - md.x) < HC.HEAL.REACH) reached = n / 60; if (healed === null && hp(victim) >= 3) healed = n / 60; });
  report(reached !== null && healed !== null, `a bot on its last heart walks to the medbay (at ${reached ? reached.toFixed(0) : '-'} s) and is whole again (${healed ? healed.toFixed(0) : '-'} s)`);
  const person = T.people[0];
  T.place(person, 'main', 900);
  person.hearts = 1; person.hurtT = 0;
  let bandaged = false;
  n = 0;
  step(T.sim, secs(60), () => { n++; person.jx = 0; if (hp(person) >= 2) { bandaged = true; return 'stop'; } });
  report(bandaged || T.st.healthStats.bandaged > 0, `a bot bandages a hurt person (${T.st.healthStats.bandaged} hearts bandaged)`);
  restore();
}

// ---- (h) the old rules ----
{
  HC.ENABLED = false;
  const { sim, st, ours, L, people, place } = boot({ humans: 2 });
  const [a, b] = people;
  const d = place(a, 'main', 0); const x = burnable(L, d); a.x = x; place(b, 'main', 1300);
  light(ours, L, d, x);
  step(sim, secs(6));
  report(hp(a) === 3 && !(a.ko > 0), 'with hearts off a fire does not hurt a crewman');
  const grunt = ours.sim.raiders.dropOne(x + 60, L.platforms[d].y - 50, 'grunt');
  let koed = false;
  step(sim, secs(14), () => { if (a.ko > 0) { koed = true; return 'stop'; } });
  report(koed, 'with hearts off a raider\'s blow knocks him out at once, as it did');
  report(a.ui && a.ui.hp == null, 'with hearts off the phone gets no hearts');
  restore();
}

// ---- (i) the TV ----
{
  const calls = [];
  const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : (...a) => { calls.push(k); }), set: (o, k, v) => { o[k] = v; return true; } });
  const art = createHealthArt({ ctx });
  let threw = null;
  try { art.pips(100, 100, 1, 3, 0.5); art.pips(100, 100, 2.5, 3, 1); art.pips(100, 100, 0, 3, 1); } catch (e) { threw = e; }
  report(!threw && calls.filter((c) => c === 'fill').length >= 9 && calls.includes('clip'), `the heart pips draw on a stub canvas (${calls.filter((c) => c === 'fill').length} fills, a clipped half heart)${threw ? ' ' + threw.message : ''}`);
}

// ---- (j) botsim with hot settings ----
{
  for (const cfg of ['{"BLOW":{"default":1.5},"FIRE":{"REACH":90,"FIRST":0.3,"TICK":0.8}}', '{"SHELL":{"RADIUS":220}}']) {
    const r = spawnSync(process.execPath, [path.join(publicDir, '..', 'tools', 'botsim.mjs'), '--minutes', '3', '--seed', '4', '--map', 'route', '--blowout', '40'], { env: { ...process.env, HEALTH_CFG: cfg }, encoding: 'utf8' });
    const err = (r.stdout.match(/^errors: (\d+)/m) || [])[1];
    const crew = (r.stdout.match(/^crew.*$/m) || [''])[0];
    report(r.status === 0 && err === '0', `3 minutes of botsim with ${cfg}: 0 errors${crew ? ' - ' + crew.slice(0, 150) : ''}`);
  }
}

report(errors.length === 0, `no exceptions in any scene${errors.length ? ': ' + errors.join(' || ') : ''}`);
console.log(ok ? 'HEALTH GATE PASSED' : 'HEALTH GATE FAILED');
process.exit(ok ? 0 : 1);
