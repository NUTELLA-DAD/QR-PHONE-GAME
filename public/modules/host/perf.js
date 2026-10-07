// Performance governor: keeps the host smooth by quietly lowering detail when frames get slow, and bringing it back
// when there is room. It only flips existing switches (see LEVELS); the art files ask perfState.level.
//   3 high   everything (Sharp screen if chosen in the pause menu)
//   2 good   Sharp screen off (pixel ratio 1)
//   1 medium + painted textures off, darkness drawn coarser (config.PERF.DARK_RES_LOW), no mist/near background strips
//   0 low    + no painted clouds strip, fewer smoke puffs, flat threat glows
// Slow = frame rate under MIN_FPS or draw time over BUDGET_MS for DROP_SECS -> one level down.
// Comfortably fast for RISE_SECS -> one level up. If we climb and have to drop again soon, the next climb waits
// twice as long (up to RISE_MAX_SECS), so it never flip-flops. Tuning numbers live in config.PERF.
import { config } from '../../config.js';

export const perfState = { level: 3 };
export const LEVEL_NAMES = ['low', 'medium', 'good', 'high'];
const MODES = ['auto', 'high', 'medium', 'low'];
const MODE_LEVEL = { high: 3, medium: 1, low: 0 };
const KEY = 'airshipDetail';

// Little questions the art files ask (all cheap).
export const perfTextures = () => perfState.level >= 2;
export const perfDarkRes = (res) => (perfState.level <= 1 ? Math.max(res, Number(config.PERF && config.PERF.DARK_RES_LOW) || res) : res);
export const perfSkipLayer = (kind) => (perfState.level <= 1 && (kind === 'mist' || kind === 'near')) || (perfState.level <= 0 && kind === 'clouds');
export const perfLowFx = () => perfState.level <= 0;

export function createPerfGovernor({ onChange = () => {}, sharpOn = () => false } = {}) {
  const P = () => config.PERF || {};
  let mode = 'auto';
  try {
    const m = localStorage.getItem(KEY);
    if (MODES.includes(m)) mode = m;
  } catch { /* (no storage: stay on auto) */ }
  if (P().AUTO === false && mode === 'auto') mode = 'high';
  if (mode !== 'auto') perfState.level = MODE_LEVEL[mode];

  let emaGap = 16.7;
  let emaDraw = 5;
  let badT = 0;
  let goodT = 0;
  let settleUntil = 0; // ignore timings until then (start-up, just after a change)
  let lastRise = -1e9;
  let lastDrop = -1e9;
  let riseWait = null; // seconds of calm needed before climbing (grows if we flip back down)
  let started = false;

  const apply = (level, now) => {
    level = Math.max(0, Math.min(3, level));
    if (level === perfState.level) return;
    perfState.level = level;
    badT = 0;
    goodT = 0;
    settleUntil = now + 1500;
    try { onChange(level); } catch { /* (never break the frame) */ }
  };

  const setMode = (m, now = performance.now()) => {
    if (!MODES.includes(m)) m = 'auto';
    mode = m;
    try { localStorage.setItem(KEY, m); } catch { /* (not remembered) */ }
    if (m === 'auto') apply(3, now);
    else apply(MODE_LEVEL[m], now);
  };
  const cycleMode = () => {
    setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
    return mode;
  };
  const label = () => (mode === 'auto' ? `Detail: auto (${LEVEL_NAMES[perfState.level]})` : `Detail: ${mode}`);

  // Call once per frame with the real time between frames and how long drawing took (both ms).
  const update = (now, gapMs, drawMs) => {
    try {
      if (!started) {
        started = true;
        settleUntil = now + 4000; // textures and images are still loading: don't judge yet
      }
      if (mode !== 'auto' || P().AUTO === false) return;
      if (!(gapMs > 0) || gapMs > 500) { // a hidden tab or a long pause: not a speed problem
        badT = 0;
        goodT = 0;
        return;
      }
      if (now < settleUntil) return;
      const g = Math.min(100, gapMs); // (one huge hitch shouldn't count for a whole second)
      const a = Math.min(1, g / 750);
      emaGap += (g - emaGap) * a;
      emaDraw += (Math.min(100, Math.max(0, drawMs)) - emaDraw) * a;
      const cfg = P();
      const slow = emaGap > 1000 / (cfg.MIN_FPS || 50) || emaDraw > (cfg.BUDGET_MS || 12);
      const fast = emaGap < 1000 / ((cfg.MIN_FPS || 50) + 7) && emaDraw < (cfg.BUDGET_MS || 12) * 0.6;
      badT = slow ? badT + g / 1000 : 0;
      goodT = fast ? goodT + g / 1000 : 0;
      const L = perfState.level;
      if (badT >= (cfg.DROP_SECS || 2) && L > 0) {
        let next = L - 1;
        if (next === 2 && !sharpOn()) next = 1; // (level 2 only matters when Sharp is on)
        lastDrop = now;
        if (now - lastRise < 45000) riseWait = Math.min(cfg.RISE_MAX_SECS || 160, (riseWait || cfg.RISE_SECS || 10) * 2);
        apply(next, now);
      } else if (goodT >= (riseWait || cfg.RISE_SECS || 10) && L < 3) {
        let next = L + 1;
        if (next === 2 && !sharpOn()) next = 3;
        if (now - lastDrop > 120000) riseWait = null; // (fine for a long while: forget the penalty)
        lastRise = now;
        apply(next, now);
      }
    } catch { /* (never break the frame) */ }
  };

  return { update, setMode, cycleMode, label, getMode: () => mode, level: () => perfState.level, state: () => ({ emaGap, emaDraw, badT, goodT, riseWait }) };
}
