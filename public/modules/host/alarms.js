// ONE VOICE (FUN.md F2): the alarm arbiter. Every banner the TV says goes through world.say(kind, text, pri, hold, at) - nobody writes state.ev.warn / warnText any more.
// Before this, ~100 places wrote the one banner slot and the last writer won, so nobody could read it. Now:
//   - state.ev.warn (seconds left) and state.ev.warnText are still the OUTPUT, so everything that reads them (render.js, sfx.js, music.js, the tools) keeps working;
//   - a message that is lower than the one on screen waits in a small queue (config.ALARMS.QUEUE); one of equal or higher priority takes over when the banner on screen has had HOLD seconds;
//   - priority PREEMPT (8) and above - a crash, FALLING - cuts in at once; the same words are merged, not queued twice;
//   - `at` ({ deck, role, all }) says whom a message concerns: the phones show ONE line, the top alarm that concerns that player's deck or seat (phoneLine).
// It is text only: nothing in the simulation reads the banner to decide anything, so a seeded run is the same with ENABLED on or off.
//   world.say(kind, text, pri?, hold?, at?)   kind: a key of ALARMS.PRI (pri defaults to it); hold: seconds the banner stays up (default HOLD); returns true if it was shown or queued
//   world.alarmTick(dt)                       once a step (threats.js update): the banner counts down, the queue moves on
//   world.alarmClear()                        nothing on screen, nothing waiting (a new lobby, a new round)
//   world.alarmPhone(player, role)            the one line for a phone ('' = none)
import { config } from '../../config.js';

export function createAlarms({ world }) {
  const A = () => config.ALARMS;
  let seq = 0; // arrival order, so equals keep their order in the queue
  // The banner's own book-keeping lives on state.ev next to warn / warnText (created lazily: a tool may have replaced state.ev).
  const evOf = () => {
    const ev = world.ev;
    if (!ev.q) { ev.q = []; ev.pri = 0; ev.kind = ''; ev.at = null; ev.age = 0; ev.dur = 0; ev.clock = 0; ev.shown = 0; }
    return ev;
  };
  const protect = (ev) => Math.min(ev.dur, A().HOLD); // how long the banner on screen is safe from a message that is not urgent
  const sort = (q) => q.sort((a, b) => b.pri - a.pri || a.seq - b.seq);

  const show = (ev, m) => {
    ev.warn = m.hold;
    ev.warnText = m.text;
    ev.pri = m.pri;
    ev.kind = m.kind;
    ev.at = m.at;
    ev.age = 0;
    ev.dur = m.hold;
    ev.shown++;
    if (ev.log) ev.log.push({ t: ev.clock, kind: m.kind, pri: m.pri, text: m.text, hold: m.hold }); // (a tool's record of every banner shown: tools/alarms-check.mjs)
  };

  const enqueue = (ev, m) => {
    const same = ev.q.find((q) => q.text === m.text);
    if (same) { // the same words twice: one message, the louder and longer of the two
      same.pri = Math.max(same.pri, m.pri);
      same.hold = Math.max(same.hold, m.hold);
      same.at = same.at || m.at;
      sort(ev.q);
      return true;
    }
    m.seq = ++seq;
    m.wait = 0;
    ev.q.push(m);
    sort(ev.q);
    if (ev.q.length > A().QUEUE) return ev.q.pop() !== m; // (the lowest and newest goes: false if that was this one)
    return true;
  };

  const say = (kind, text, pri, hold, at) => {
    const ev = evOf(), a = A();
    text = String(text);
    if (pri == null) pri = a.PRI[kind] != null ? a.PRI[kind] : a.PRI.info;
    if (hold == null) hold = a.HOLD;
    if (!a.ENABLED) { // the old banner: the last writer wins
      ev.warn = hold;
      ev.warnText = text;
      return true;
    }
    const m = { kind, text, pri, hold, at: at || null };
    if (ev.warn > 0 && ev.warnText && text.includes(ev.warnText)) { // the same words still up (or the same words with more after them: RAMMED! + PARTS BROKE OFF!): one banner, kept up
      ev.warnText = text;
      ev.warn = Math.max(ev.warn, hold);
      ev.dur = ev.age + ev.warn;
      if (pri > ev.pri) { ev.pri = pri; ev.kind = kind; }
      ev.at = ev.at || m.at;
      return true;
    }
    if (!(ev.warn > 0)) { // nothing on screen: say it now (the most urgent first if some were waiting)
      if (!ev.q.length) { show(ev, m); return true; }
      const kept = enqueue(ev, m);
      show(ev, ev.q.shift());
      return kept;
    }
    const safe = ev.age < protect(ev); // the banner on screen is still inside its HOLD
    if (pri >= a.PREEMPT && !(ev.pri >= a.PREEMPT && ev.pri > pri && safe)) { // urgent: at once
      if (ev.pri >= 6 && ev.pri < pri && ev.warn >= 1) enqueue(ev, { kind: ev.kind, text: ev.warnText, pri: ev.pri, hold: ev.warn, at: ev.at }); // (what it cut off is not lost if it still matters)
      show(ev, m);
      return true;
    }
    if (!safe && pri >= ev.pri && !(ev.q.length && ev.q[0].pri > pri)) { // its time is up and this one is as loud or louder (and nothing louder waits)
      show(ev, m);
      return true;
    }
    return enqueue(ev, m);
  };

  const tick = (dt) => {
    const ev = evOf(), a = A();
    if (ev.warn > 0) ev.age += dt;
    ev.warn = Math.max(0, ev.warn - dt);
    if (!a.ENABLED) { ev.q.length = 0; return; }
    ev.clock += dt;
    if (ev.q.length) {
      for (const m of ev.q) m.wait += dt;
      ev.q = ev.q.filter((m) => m.wait <= a.STALE);
      if (ev.q.length && (!(ev.warn > 0) || (ev.age >= protect(ev) && ev.q[0].pri >= ev.pri))) show(ev, ev.q.shift());
    }
  };

  const clear = () => {
    const ev = evOf();
    ev.warn = 0;
    ev.q.length = 0;
  };

  // The one line for a player's phone: the most urgent alarm (on screen or waiting) that concerns the deck he stands on or the seat he holds.
  const phoneLine = (player, role) => {
    const a = A(), ev = evOf();
    if (!a.ENABLED || !a.PHONE_ONE_LINE) return '';
    const concerns = (kind, at) => a.PHONE_ALL.includes(kind) || (!!at && (at.all || (at.deck != null && at.deck === player.d) || (!!at.role && at.role === role)));
    let best = null;
    if (ev.warn > 0 && ev.warnText && concerns(ev.kind, ev.at)) best = { pri: ev.pri, text: ev.warnText };
    for (const m of ev.q) if (concerns(m.kind, m.at) && (!best || m.pri > best.pri)) best = m;
    return best ? best.text : '';
  };

  for (const [k, fn] of [['say', say], ['alarmTick', tick], ['alarmClear', clear], ['alarmPhone', phoneLine]]) Object.defineProperty(world, k, { value: fn, enumerable: false, configurable: true, writable: true }); // (not data: a ship's context finds them through the prototype, ships.js WORLD_SHARED)
  return { say, tick, clear, phoneLine };
}
