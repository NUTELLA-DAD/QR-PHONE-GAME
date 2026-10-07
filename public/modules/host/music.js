// Background music on the TV: three looping tracks (public/audio/, config.MUSIC) chosen from the game
// state and crossfaded. Web Audio only, decoded once, looped gapless (loopStart/loopEnd trim the silence
// at either end of each file; a track that fades out/in instead of looping cleanly is looped with a short
// crossfade). Reads the state, never changes it, and never throws; in Node (bot sims) it does nothing.
import { config } from '../../config.js';

const NOOP = { update() {}, toggle: () => false, isOn: () => false, setSoundMuted() {}, debug: () => ({}) };
const SAVE_KEY = 'airshipMusic';

export function createMusic(state) {
  const M = config.MUSIC;
  const Ctx = typeof window !== 'undefined' && typeof fetch === 'function' ? window.AudioContext || window.webkitAudioContext : null;
  if (!M || !Ctx) return NOOP;

  let ac = null;
  let bus = null; // music volume / mute
  let duck = null; // dips under big warnings
  let on = true; // the pause-menu "Music" button (remembered)
  let soundMuted = !!config.SOUND.START_MUTED; // the Sound button / M key
  try {
    on = localStorage.getItem(SAVE_KEY) !== '0';
  } catch {
    /* (not remembered) */
  }
  const tracks = {};
  for (const name of Object.keys(M.FILES)) tracks[name] = { name, buf: null, failed: false, playing: false, srcs: [], gain: null, stopAt: 0, nextAt: 0, first: true, xfade: false, loopStart: 0, loopEnd: 0, info: '' };
  let cur = null; // the track that is (or is about to be) playing
  let since = 0; // audio-clock time of the last switch
  let busT = -1;
  let duckT = -1;

  const level = () => (M.ENABLED && on && !soundMuted ? M.VOLUME : 0);
  const applyLevel = () => {
    if (!bus) return;
    const v = level();
    if (v !== busT) {
      busT = v;
      bus.gain.setTargetAtTime(v, ac.currentTime, 0.15);
    }
  };

  // Find where the music really starts and ends, and whether the ends fade (then it needs a crossfade loop).
  const analyse = (tr) => {
    const b = tr.buf;
    const sr = b.sampleRate;
    const chans = [];
    for (let c = 0; c < b.numberOfChannels; c++) chans.push(b.getChannelData(c));
    const n = b.length;
    const loud = (i) => {
      let m = 0;
      for (const d of chans) m = Math.max(m, Math.abs(d[i]));
      return m;
    };
    let a = 0;
    while (a < n - 1 && loud(a) < M.SILENCE) a++;
    let z = n - 1;
    while (z > a && loud(z) < M.SILENCE) z--;
    const pad = Math.round(0.004 * sr);
    const i0 = Math.max(0, a - pad);
    const i1 = Math.min(n, z + 1 + pad);
    tr.loopStart = i0 / sr;
    tr.loopEnd = i1 / sr;
    const rms = (from, to) => {
      const d = chans[0];
      let s = 0;
      for (let i = from; i < to; i++) s += d[i] * d[i];
      return Math.sqrt(s / Math.max(1, to - from));
    };
    const w = Math.min(Math.round(0.25 * sr), (i1 - i0) >> 2);
    const avg = rms(i0, i1);
    const head = rms(i0, i0 + w);
    const tail = rms(i1 - w, i1);
    tr.xfade = head < avg * M.EDGE_RATIO || tail < avg * M.EDGE_RATIO;
    tr.info = `${(tr.loopEnd - tr.loopStart).toFixed(1)}s trimmed ${tr.loopStart.toFixed(2)}..${tr.loopEnd.toFixed(2)} of ${b.duration.toFixed(1)}s head=${(head / avg).toFixed(2)} tail=${(tail / avg).toFixed(2)} ${tr.xfade ? 'crossfade loop' : 'gapless loop'}`;
  };

  const load = async (name) => {
    const tr = tracks[name];
    try {
      const res = await fetch(M.FILES[name]);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      tr.buf = await ac.decodeAudioData(await res.arrayBuffer());
      analyse(tr);
    } catch (e) {
      tr.failed = true;
      tr.info = 'failed: ' + (e && e.message);
    }
  };

  const fadeCurve = (up) => {
    const c = new Float32Array(32);
    for (let i = 0; i < 32; i++) c[i] = Math.sin(((up ? i : 31 - i) / 31) * Math.PI * 0.5); // (equal power)
    return c;
  };
  const UP = fadeCurve(true);
  const DOWN = fadeCurve(false);

  // Crossfade-loop tracks: queue the next overlapping segments a little ahead on the audio clock.
  const pump = (tr) => {
    const len = tr.loopEnd - tr.loopStart;
    const xf = Math.min(M.LOOP_FADE, len / 3);
    let guard = 0;
    while (tr.nextAt - ac.currentTime < 3 && guard++ < 4) {
      const t0 = tr.nextAt;
      const g = ac.createGain();
      g.connect(tr.gain);
      if (tr.first) g.gain.setValueAtTime(1, t0);
      else {
        g.gain.setValueAtTime(0, t0);
        g.gain.setValueCurveAtTime(UP, t0, xf);
        g.gain.setValueAtTime(1, t0 + xf + 0.01);
      }
      g.gain.setValueCurveAtTime(DOWN, t0 + len - xf, xf);
      const src = ac.createBufferSource();
      src.buffer = tr.buf;
      src.connect(g);
      src.start(t0, tr.loopStart, len);
      src.onended = () => {
        tr.srcs = tr.srcs.filter((s) => s !== src);
      };
      tr.srcs.push(src);
      tr.first = false;
      tr.nextAt = t0 + len - xf;
    }
  };

  const startTrack = (tr, fade) => {
    const now = ac.currentTime;
    tr.gain.gain.cancelScheduledValues(now);
    tr.gain.gain.setValueAtTime(0, now);
    tr.gain.gain.linearRampToValueAtTime(M.TRACK_GAIN[tr.name] ?? 1, now + fade);
    tr.playing = true;
    tr.stopAt = 0;
    if (tr.xfade) {
      tr.first = true;
      tr.nextAt = now + 0.05;
      pump(tr);
    } else {
      const src = ac.createBufferSource();
      src.buffer = tr.buf;
      src.loop = true;
      src.loopStart = tr.loopStart;
      src.loopEnd = tr.loopEnd;
      src.connect(tr.gain);
      src.start(0, tr.loopStart);
      tr.srcs = [src];
    }
  };
  const stopTrack = (tr) => {
    for (const s of tr.srcs) {
      try {
        s.stop();
      } catch {
        /* (already ended) */
      }
    }
    tr.srcs = [];
    tr.playing = false;
    tr.stopAt = 0;
  };

  // Which track the game wants right now.
  const want = () => {
    const s = state;
    if (s.phase !== 'flying' || s.vote || s.scorecard || s.runEnd) return 'dock';
    const g = s.gunship;
    if (s.boss || s.goingDown || (g && (g.phase === 'hunt' || g.phase === 'latch')) || (s.tempo && s.tempo.phase === 'peak')) return 'combat';
    if (s.ship.down) return cur || 'calm';
    return 'calm';
  };

  const switchTo = (name) => {
    const now = ac.currentTime;
    cur = name;
    since = now;
    for (const tr of Object.values(tracks)) {
      if (tr.name === name && tr.playing) {
        // (coming back to a track that was still fading out: bring it back up)
        tr.gain.gain.cancelScheduledValues(now);
        tr.gain.gain.setValueAtTime(tr.gain.gain.value, now);
        tr.gain.gain.linearRampToValueAtTime(M.TRACK_GAIN[name] ?? 1, now + M.CROSSFADE);
        tr.stopAt = 0;
      }
      if (tr.name === name || !tr.playing) continue;
      tr.gain.gain.cancelScheduledValues(now);
      tr.gain.gain.setValueAtTime(tr.gain.gain.value, now);
      tr.gain.gain.linearRampToValueAtTime(0, now + M.CROSSFADE);
      tr.stopAt = now + M.CROSSFADE + 0.2;
    }
  };

  const start = () => {
    try {
      if (!M.ENABLED) return;
      if (ac) {
        if (ac.state === 'suspended') ac.resume();
        return;
      }
      ac = new Ctx();
      bus = ac.createGain();
      bus.gain.value = 0;
      duck = ac.createGain();
      bus.connect(duck).connect(ac.destination);
      for (const tr of Object.values(tracks)) {
        tr.gain = ac.createGain();
        tr.gain.gain.value = 0;
        tr.gain.connect(bus);
      }
      applyLevel();
      const first = want();
      const order = [first, ...Object.keys(tracks).filter((n) => n !== first)];
      (async () => {
        for (const name of order) await load(name);
      })();
    } catch {
      ac = null; // (music is a nice-to-have)
    }
  };
  if (typeof addEventListener === 'function') {
    for (const ev of ['pointerdown', 'keydown', 'click']) addEventListener(ev, start);
  }

  const update = () => {
    try {
      if (!ac) return;
      if (ac.state === 'suspended') return; // (still waiting for a click)
      const now = ac.currentTime;
      applyLevel();
      const w = want();
      if (cur === null) switchTo(w);
      else if (w !== cur && (w === 'dock' || cur === 'dock' || now - since >= M.MIN_HOLD)) switchTo(w);
      const tr = tracks[cur];
      if (tr && tr.buf && !tr.playing) startTrack(tr, M.CROSSFADE);
      for (const t of Object.values(tracks)) {
        if (!t.playing) continue;
        if (t.stopAt && now > t.stopAt && t !== tr) stopTrack(t);
        else if (t.xfade) pump(t);
      }
      // Duck under the big warning banners (the cheerful ones are left alone).
      const text = state.ev && state.ev.warn > 0 ? state.ev.warnText || '' : '';
      const d = text && !/CHECKPOINT|HOME|BEACON|UPGRADE|DOWN!|READY|SUPPLIES|BOUGHT|CLEAR|PATCHED|VICTORY|COMPLETE/.test(text) ? M.DUCK : 1;
      if (d !== duckT) {
        duckT = d;
        duck.gain.setTargetAtTime(d, now, d < 1 ? M.DUCK_IN : M.DUCK_OUT);
      }
    } catch {
      /* (never break the game) */
    }
  };

  const toggle = () => {
    on = !on;
    try {
      localStorage.setItem(SAVE_KEY, on ? '1' : '0');
    } catch {
      /* (not remembered) */
    }
    applyLevel();
    return on;
  };

  const debug = () => ({
    cur,
    on,
    soundMuted,
    ctx: ac && ac.state,
    busGain: bus && bus.gain.value,
    duckGain: duck && duck.gain.value,
    want: want(),
    tracks: Object.fromEntries(Object.values(tracks).map((t) => [t.name, { loaded: !!t.buf, failed: t.failed, playing: t.playing, gain: t.gain && t.gain.gain.value, srcs: t.srcs.length, info: t.info }])),
  });

  return {
    update,
    toggle,
    isOn: () => on,
    setSoundMuted: (m) => {
      soundMuted = !!m;
      applyLevel();
    },
    debug,
  };
}
