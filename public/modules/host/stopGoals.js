// THE TWO STOPS ABOUT DERELICTS AND BALLOONS (LOOP.md G6, config.DERELICT.RUN / .DEFEND): the one big thing of a stop, with the briefing card before it and the ESCAPE calm after it (FUN.md F6).
//
//   SALVAGE RUN  (stop.salvage, on a FIELD map: maps.js buildFieldMap, three wrecks hang in the sky) strip RUN.NEED parts off the wrecks and bring them aboard before the storm (RUN.TIME s). The crew goes ashore (3 or more: AWAY.MIN_CREW;
//                with fewer the stop is the old beacon run); bots go on foot in this stop and only in this one (DERELICT.BOTS.IN_RUN). Won: the stop's reward and WIN_BONUS, every part a named card. Lost: the storm takes the wrecks, the stop pays
//                FAIL_REWARD of its reward and the voyage goes on all the same - nobody is punished with a wreck. Parts brought aboard before that still become cards.
//   DEFEND       (stop.defend, a FIELD map with one site) a stranded supply balloon hangs in the sky; waves of bats go for IT, not for the ship: shoot them off it (the ship stands off to the side of it) for TIME s. Each bat on the balloon eats
//                GNAW hit points a second and a bat that arrives bites HIT at once; at 0 the balloon is lost (FAIL_REWARD of the reward, the voyage goes on). Held: WIN_BONUS and a thank-you supply balloon.
//
// state.course.goal = { kind, done, win, over, t, total, ... } while a field map is flown (null on every other map); the TV and the bots read it. Everything is deterministic (a hash of the wave decides where each bat comes from).
import { config } from '../../config.js';
import { mendHull } from './ships.js';
import { setGoal } from './maps.js';
import { pop } from './popups.js';
import { inRock } from './course.js';

const D = () => config.DERELICT;
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; };

// Which field a stop is flown on ('salvage' | 'defend' | null = the stop as it always was). simulation.js missionOpts asks; a salvage run needs a crew that can go ashore.
export function fieldFor(state, stop) {
  const K = D();
  if (!K.ENABLED || !config.AWAY.ENABLED || config.PVP.ENABLED || !stop) return null;
  if (stop.defend && K.DEFEND.ENABLED) return 'defend';
  if (stop.salvage && K.RUN.ENABLED) {
    const crew = Object.values(state.players).filter((p) => !p.mate && !p.enemy && p.connected !== false).length;
    return crew >= config.AWAY.MIN_CREW ? 'salvage' : null;
  }
  return null;
}
export const crewCount = (state) => Object.values(state.players).filter((p) => !p.mate && !p.enemy && p.connected !== false).length;
export const partsNeeded = (state) => (crewCount(state) >= D().RUN.BIG_CREW ? D().RUN.NEED_BIG : D().RUN.NEED); // (parts to bring aboard in a salvage run: one more for a big crew)

export function createStopGoals({ state, finish, deps }) {
  const stats = { salvageWon: 0, salvageLost: 0, defendWon: 0, defendLost: 0, waves: 0, bites: 0, early: 0 }; // (the tools' tally: it runs on over every map of a run)
  const course = () => state.course;
  const away = () => state.away;
  const say = (text, hold = 4) => state.say && state.say('objective', text, null, hold);
  const moment = (kind, who, data) => state.moment && state.moment(kind, { who: who || [], where: null, data });
  const runInfo = () => (state.run ? (state.run.derelict ||= { pending: [], names: [], boarded: 0, stripped: 0, hauled: 0, named: 0, won: 0, lost: 0, defendWon: 0, defendLost: 0 }) : null);

  // A new map: the goal of a field map, null on any other.
  function begin(map) {
    const c = course();
    c.goal = null;
    if (!map || !map.field) return;
    const K = D();
    if (map.field === 'salvage') {
      const need = partsNeeded(state);
      c.goal = { kind: 'salvage', need, have: 0, t: K.RUN.TIME, total: K.RUN.TIME, warned: false, done: false, win: false, over: false, at: null, parts: 0 };
    } else {
      const s = map.sites[0], DF = K.DEFEND;
      c.goal = { kind: 'defend', t: DF.TIME, total: DF.TIME, hp: DF.HP, max: DF.HP, x: s.x, y: s.y, wave: 0, waveT: DF.WAVES.FIRST, live: false, wait: 0, done: false, win: false, over: false, spot: { x: s.x, y: s.y - 150, r: 95 }, bats: [], clean: 0, hits: 0 };
    }
  }

  // ---- shared ----
  function end(win, text, kind) {
    const c = course(), g = c.goal, K = D();
    g.done = true;
    g.win = win;
    g.over = true;
    c.done = true;
    c.pendingNext = true;
    if (c.stop) c.stop.outcome = win ? 'won' : 'lost';
    const F = g.kind === 'salvage' ? K.RUN : K.DEFEND;
    if (win) {
      mendHull(state, config.COURSE.CHECKPOINT_REPAIR);
      deps.salvage && deps.salvage(F.WIN_BONUS, g.kind === 'salvage' ? 'Salvage run complete!' : 'Balloon saved!');
    } else if (c.stop) c.stop.rewardMul = F.FAIL_REWARD;
    say(text, 5);
    const ri = runInfo();
    if (ri) { if (g.kind === 'salvage') ri[win ? 'won' : 'lost']++; else ri[win ? 'defendWon' : 'defendLost']++; }
    stats[kind + (win ? 'Won' : 'Lost')]++;
    moment(kind + (win ? '-won' : '-lost'), null, { name: g.kind === 'salvage' ? 'the wrecks' : 'the balloon', n: g.kind === 'salvage' ? g.have : Math.round(g.hp) });
    finish({ kind: 'home', lap: c.lap + 1 }, true); // (the ESCAPE calm: the crew gets its men home and any last crate aboard; a lost stop has it too)
  }

  // ---- SALVAGE RUN ----
  // Parts that could still be brought aboard: bolted on a wreck, or a crate on its way (in a man's arms, on a rope, lying on a deck).
  function potential() {
    const t = away() && away().tre, der = away() && away().der;
    let n = 0;
    for (const d of der ? der.list : []) for (const q of d.parts) if (q.state === 'bolted') n++;
    for (const c of t ? t.chests : []) if (c.kind === 'part' && !c.counted && ['carried', 'ground', 'hauled', 'aboard'].includes(c.state)) n++;
    return n;
  }
  function salvageStep(dt, sx) {
    const c = course(), g = c.goal, map = c.map, data = away().der, der = state.groundSys.der;
    g.have = data.got;
    g.t = Math.max(0, g.t - dt);
    c.progress = Math.min(0.99, g.have / g.need);
    const K = D().RUN;
    if (g.have >= g.need) return end(true, 'SALVAGE RUN COMPLETE! ' + g.have + ' PARTS ABOARD - EVERY ONE IS A NAMED CARD AT THE DOCK', 'salvage');
    if (g.t <= 0 || (g.t < g.total - K.EARLY_AFTER && g.have + potential() < g.need)) {
      if (g.t > 0) stats.early++;
      der.close(D().SINK_AFTER);
      return end(false, g.t <= 0 ? 'THE STORM TAKES THE WRECKS! ' + g.have + ' OF ' + g.need + ' PARTS ABOARD - THE VOYAGE GOES ON' : 'NOTHING LEFT TO STRIP - ' + g.have + ' OF ' + g.need + ' PARTS ABOARD', 'salvage');
    }
    if (!g.warned && g.t <= K.WARN) { g.warned = true; say('STORM FRONT IN ' + Math.round(g.t) + ' SECONDS - GET WHAT YOU CAN OFF THE WRECKS!', 4); }
    // the bot helm's goal: the nearest wreck with a part still to take (it moves as the wreck drifts)
    const d = der.target(sx);
    if (d && map) {
      const C = map.CELL, i = Math.floor(d.x / C), j = Math.floor((d.y - D().HOVER_REF) / C);
      if (!g.at || g.at.id !== d.id || g.at.i !== i || g.at.j !== j) {
        g.at = { id: d.id, i, j };
        setGoal(map, { i, j });
        c.stuckBest = null;
      }
    }
  }

  // ---- DEFEND ----
  function spawnWave() {
    const c = course(), g = c.goal, W = D().DEFEND.WAVES;
    g.wave++;
    stats.waves++;
    const n = W.BATS[Math.min(g.wave - 1, W.BATS.length - 1)];
    const key = String(c.stop && c.stop.id) + '|w' + g.wave;
    g.batsNow = [];
    for (let i = 0; i < n; i++) {
      const side = (g.wave + i) % 2 ? 1 : -1;
      let x = g.x + side * (W.SPAWN + hash(key + 'x' + i) * W.SPREAD), y = g.y - 120 + (hash(key + 'y' + i) - 0.5) * W.HEIGHT;
      for (let t = 0; t < 8 && inRock(state, x, y); t++) y -= 160;
      const b = { x, y, vx: 0, vy: 0, tx: 0, ty: 0, hp: 1, phase: hash(key + 'p' + i) * 6, delay: 0, goal: g.spot };
      state.bats.push(b);
      g.batsNow.push(b);
    }
    state.say && state.say('setpiece', 'BATS ON THE BALLOON! WAVE ' + g.wave + ' - SHOOT THEM OFF IT!', null, 3.5);
    pop(state, g.x, g.y - 330, 'WAVE ' + g.wave, '#ff8c1a', 1.1);
  }
  function defendStep(dt, sx, sy) {
    const c = course(), g = c.goal, DF = D().DEFEND;
    if (!g.live) { // the clock and the bats wait for the ship to come within ARRIVE px of the balloon (or ARRIVE_MAX s of flying)
      g.wait += dt;
      if (Math.hypot(sx - g.x, sy - g.y) > DF.ARRIVE && g.wait < DF.ARRIVE_MAX) return;
      g.live = true;
      say('THE BALLOON! HOLD IT FOR ' + DF.TIME + ' SECONDS - SHOOT THE BATS OFF IT', 4);
    }
    g.t = Math.max(0, g.t - dt);
    g.waveT -= dt;
    if (g.waveT <= 0 && g.t > DF.WAVES.EVERY * DF.WAVES.LAST_CUT) { spawnWave(); g.waveT = DF.WAVES.EVERY; }
    let eating = 0;
    for (const b of state.bats) {
      if (b.goal !== g.spot || !b.onGoal || b.dead || b.hp <= 0) continue;
      eating++;
      if (!b.bit) { b.bit = true; g.hp -= DF.WAVES.HIT; g.hits++; stats.bites++; pop(state, g.x, g.y - 200, 'CHOMP!', '#ff4d4d', 1); }
    }
    g.eating = eating;
    g.hp = Math.max(0, g.hp - eating * DF.WAVES.GNAW * dt);
    c.progress = Math.min(0.99, 1 - g.t / g.total);
    if (g.batsNow && g.batsNow.length && g.batsNow.every((b) => b.dead || b.hp <= 0)) { // a wave beaten off
      if (!g.batsNow.some((b) => b.bit)) { g.clean++; if (g.clean === 1) moment('defend-saved', null, { name: 'the balloon', n: g.wave }); }
      g.batsNow = [];
    }
    if (g.hp <= 0) {
      for (const b of state.bats) if (b.goal === g.spot) b.hp = 0; // (the bats go home with their prize)
      return end(false, 'THE BALLOON IS LOST! THE VOYAGE GOES ON', 'defend');
    }
    if (g.t <= 0) {
      for (const b of state.bats) if (b.goal === g.spot) { b.hp = 0; b.dead = true; }
      if (DF.SUPPLY && deps.supply) deps.supply();
      return end(true, 'THE BALLOON IS SAFE! ' + Math.round(g.hp) + ' OF ' + g.max + ' HOLDING - THEY SEND SUPPLIES', 'defend');
    }
  }

  // course.js mapProgress, once a step (after the stuck / tug rules and the escape calm): the goal's own rules.
  function progress(sx, sy, dt) {
    const g = course().goal;
    if (!g || g.done) return;
    if (g.kind === 'salvage') salvageStep(dt, sx);
    else defendStep(dt, sx, sy);
  }

  return { begin, progress, stats };
}
