// Cartoon sound effects, synthesised with Web Audio (no sound files, works offline).
// It watches the game state each frame and plays sounds for what changed: shots, hits, kills,
// warnings, upgrades, swings, pickups, hammering.
import { config } from '../../config.js';

export function createSfx(state) {
  let ac = null;
  let master = null;
  let muted = config.SOUND.START_MUTED;
  let noiseBuf = null;
  const last = { shells: 0, bullets: 0, kills: 0, hull: 100, warn: '', vote: false, down: false, boss: false };
  const perPlayer = new Map();
  const cooldown = {};

  // Browsers only allow sound after the first click/key press on the page.
  const start = () => {
    if (ac) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ac = new Ctx();
    master = ac.createGain();
    master.gain.value = muted ? 0 : config.SOUND.VOLUME;
    master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  };
  addEventListener('pointerdown', start);
  addEventListener('keydown', (e) => {
    start();
    if (e.key === 'm' || e.key === 'M') toggle();
  });

  const toggle = () => {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : config.SOUND.VOLUME;
    return muted;
  };

  // Don't play the same sound more often than `gap` seconds.
  const ready = (name, gap) => {
    const now = performance.now() / 1000;
    if (cooldown[name] && now - cooldown[name] < gap) return false;
    cooldown[name] = now;
    return true;
  };

  // ---- Building blocks ----
  const env = (g, t, a, peak, d) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  };
  const tone = (type, f0, f1, dur, vol, delay = 0) => {
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, 0.005, vol, dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  };
  const noise = (filterType, freq, dur, vol, delay = 0, q = 1) => {
    const t = ac.currentTime + delay;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ac.createGain();
    env(g, t, 0.005, vol, dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  };

  // ---- The sounds ----
  const S = {
    cannon: () => {
      tone('sine', 140, 40, 0.35, 0.7);
      noise('lowpass', 900, 0.25, 0.5);
    },
    pew: () => tone('square', 900, 300, 0.08, 0.06),
    hit: (big) => {
      tone('square', 220, 90, 0.18, big ? 0.35 : 0.2);
      noise('bandpass', 1800, 0.15, big ? 0.4 : 0.25, 0, 3);
    },
    boom: () => {
      noise('lowpass', 500, 0.9, 0.8);
      tone('sine', 90, 30, 0.7, 0.6);
    },
    crash: () => {
      noise('lowpass', 300, 1.6, 0.9);
      tone('sawtooth', 120, 25, 1.4, 0.35);
    },
    swing: () => noise('highpass', 2500, 0.12, 0.35),
    pickup: () => {
      tone('triangle', 660, 660, 0.06, 0.25);
      tone('triangle', 990, 990, 0.08, 0.2, 0.06);
    },
    tink: () => tone('triangle', 1400 + Math.random() * 300, 1200, 0.07, 0.18),
    alarm: () => {
      tone('square', 740, 740, 0.14, 0.12);
      tone('square', 560, 560, 0.14, 0.12, 0.16);
    },
    bell: () => {
      tone('sine', 880, 870, 0.9, 0.3);
      tone('sine', 1320, 1310, 0.7, 0.12);
    },
    fanfare: () => [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.18, 0.25, i * 0.11)),
    impact: () => {
      noise('bandpass', 1200, 0.12, 0.3, 0, 2);
      tone('square', 300, 120, 0.08, 0.08);
    },
    charge: () => tone('sawtooth', 220, 700, 0.7, 0.07),
    // Primed shells and the phone radar.
    primed: () => {
      tone('triangle', 660, 1320, 0.18, 0.22);
      tone('sine', 1320, 1760, 0.28, 0.16, 0.12);
    },
    bigshot: () => {
      tone('square', 180, 50, 0.22, 0.2);
      noise('bandpass', 700, 0.22, 0.35, 0, 2);
    },
    ping: () => {
      tone('sine', 1180, 1180, 0.1, 0.22);
      tone('sine', 1570, 1570, 0.16, 0.18, 0.09);
    },
    clang: (big) => {
      tone('triangle', big ? 180 : 260, big ? 70 : 120, 0.4, big ? 0.4 : 0.25);
      tone('square', 520, 300, 0.12, 0.08);
      noise('bandpass', 900, 0.3, big ? 0.45 : 0.3, 0, 2);
    },
    horn: () => {
      tone('sawtooth', 70, 65, 1.6, 0.35);
      tone('sawtooth', 104, 98, 1.6, 0.2);
    },
  };
  const play = (name, arg) => {
    if (!ac || muted) return;
    try {
      S[name](arg);
    } catch {
      // Sound is a nice-to-have; never let it break the game.
    }
  };

  // Called every frame: compare with last frame and play what's new.
  const update = () => {
    // Sounds the game asked for by name this frame.
    const q = state.sfxQ || [];
    if (ac) for (const [name, arg] of q) if (S[name] && ready(name, 0.05)) play(name, arg);
    q.length = 0;
    if (!ac) return;
    if (state.shells.length > last.shells && ready('cannon', 0.06)) play('cannon');
    if (state.bullets.length > last.bullets && ready('pew', 0.15)) play('pew');
    if (state.kills > last.kills) play('boom');
    const hullDrop = last.hull - state.ship.hull;
    if (hullDrop > 0.8 && ready('hit', 0.12)) play('hit', hullDrop > 4);
    if (state.ship.down > 0 && !last.down) play('crash');
    if (state.vote && !last.vote) play('fanfare');
    if (state.boss && !last.boss) play('horn');
    const text = state.ev.warn > 0 ? state.ev.warnText : '';
    if (text && text !== last.warn) play(/CHECKPOINT|HOME|BEACON|UPGRADE|DOWN!/.test(text) ? 'bell' : 'alarm');
    for (const p of Object.values(state.players)) {
      const prev = perPlayer.get(p.id) || {};
      if (p.swingT && p.swingT !== prev.swingT) play('swing');
      if (p.carry && p.carry !== prev.carry) play('pickup');
      const working = p.fire && p.act && (p.act.type === 'hole' || p.act.type === 'repair' || p.act.type === 'gas');
      if (working && ready('tink-' + p.id, 0.28)) play('tink');
      perPlayer.set(p.id, { swingT: p.swingT, carry: p.carry });
    }
    last.shells = state.shells.length;
    last.bullets = state.bullets.length;
    last.kills = state.kills;
    last.hull = state.ship.hull;
    last.down = state.ship.down > 0;
    last.vote = !!state.vote;
    last.boss = !!state.boss;
    last.warn = text;
  };

  return { update, toggle, isMuted: () => muted };
}
