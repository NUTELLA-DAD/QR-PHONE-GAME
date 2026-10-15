// PLAY OF THE MISSION, the recorder (SHIPS_BOOK.md L7). The scorecard replays the stop's top moment as REAL FOOTAGE of the TV picture, in slow motion. While a stop is flown the browser keeps a short rolling film of
// the sky: every 1/REPLAY.FPS second of flying replayCam.js copies the 3D canvas down to a small JPEG (REPLAY.CAP) and hands it to push(). This file keeps those frames (the last PRE seconds), and when a moment that
// weighs REPLAY.MIN_WEIGHT is recorded (moments.js onMoment) it starts a CLIP: the frames before it (shared, not copied) and POST seconds of the frames after it. At the stop's end take(n) gives the clip of the stop's
// top moment (the Log's "play of the mission"), and replayArt.js plays it on the scorecard.
// VIEW ONLY: this file reads the world and writes nothing to it, draws no random number and keeps nothing the sim reads. Memory is capped (REPLAY.MAX_BYTES, the size of the JPEGs); a clip that does not fit is dropped.
// Node-safe: no DOM (a Node tool pushes made-up frames; with none pushed there is never a clip, so a tool's sim is exactly the sim without a replay).
//
//   const replay = createReplay({ world })
//   replay.step(dt)         once per flying step (simulation.js, beside moments.tick): the clock
//   replay.wants()          true when a frame is due (the TV asks once per drawn picture, replayCam.js grab)
//   replay.crewFrame(project)  where each crewman is on that picture: [[who, x, y]] (0..1 of the picture); project(player, wx, wy) -> { x, y } or null
//   replay.push(frame)      a frame was grabbed: { w, h, bytes, blob, pr, P } (blob may arrive later: the frame is kept as a promise's holder, replayCam fills blob and bytes when the encoder is done)
//   replay.mark(m)          a moment was recorded (moments.js onMoment): a heavy one starts a clip
//   replay.take(n)          the clip of moment number n (or null), then forget the stop (call it when the stop's Log is written)
//   replay.reset()          forget everything (a new voyage)
//   replay.stats()          { frames, pending, bytes, best, clock, pushed } for the gates
//   createFilm(clip) / stepFilm(film, dt) / skipFilm(film) / closeFilm(film) / sampleClip(clip, u) / speedAt(clip, u)   playback (pure functions of the clip; replayArt.js draws what sampleClip returns)
//   footage.loader          set by replayCam.js in the browser: film => decodes the frames (film.src = { at(i), want(i0, i1), close() }, film.ready, film.failed). Without one (a Node tool) a film is ready at once and has no picture.
//
// A FRAME: { t, i, w, h, bytes, blob, P } the clock in seconds, its number, the picture's size, the JPEG, where the crew stood on it (P: [[who, x, y]], who indexes clip.palette).
// A CLIP: { n, kind, weight, who, crew, stop, env, frames, mark, t0, tm, len, fps, palette }; mark = the index of the frame at the moment, tm its time from the clip's start, len the clip's length in seconds.
import { config } from '../../config.js';
import { shipOf } from './ships.js';
import { toWorld } from './pose.js';

export const footage = { loader: null };
const finite = (n) => Number.isFinite(n);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (x) => { const u = clamp(x, 0, 1); return u * u * (3 - 2 * u); };

export function createReplay({ world }) {
  const R = () => config.REPLAY;
  let ring = []; // the rolling frames, oldest first
  let pending = []; // clips still waiting for their last seconds: { m, pre, post, need }
  let best = null; // the heaviest finished clip of this stop
  let clock = 0, lastGrab = 0, frameNo = 0;
  const ids = new Map(); // player id -> palette index (this stop)
  let palette = []; // [{ name, color }]
  const live = () => R().ENABLED && !(world.match && world.match.on); // (Versus has no scorecard)

  const whoIdx = (p) => {
    let i = ids.get(p.id);
    if (i === undefined) {
      if (palette.length >= R().CAPS.PALETTE) return -1;
      i = palette.length;
      ids.set(p.id, i);
      palette.push({ name: p.name || 'Somebody', color: p.color || '#e8d9b0' });
    }
    return i;
  };
  // Where each crewman is on the picture just drawn. project(player, wx, wy) is the TV's (replayCam.js): the 3D camera's, or the 2D one's.
  const crewFrame = (project) => {
    const out = [];
    if (typeof project !== 'function') return out;
    for (const p of Object.values(world.players || {})) {
      if (out.length >= R().CAPS.CREW) break;
      if (!p || p.mate || p.enemy || p.connected === false || p.hj || (p.on && p.on.away)) continue;
      let x, y;
      if (p.fly) { x = p.x; y = p.y; } else {
        if (p.d == null) continue;
        let w = null;
        try { w = toWorld(shipOf(world, p), p.x, p.y - 50); } catch { w = null; }
        if (!w) continue;
        x = w.x; y = w.y;
      }
      if (!finite(x) || !finite(y)) continue;
      let q = null;
      try { q = project(p, x, y); } catch { q = null; }
      if (!q || !finite(q.x) || !finite(q.y)) continue;
      const i = whoIdx(p);
      if (i < 0) continue;
      out.push([i, Math.round(q.x * 10000) / 10000, Math.round(q.y * 10000) / 10000]);
    }
    return out;
  };

  // ---- memory ----
  const bytes = () => {
    const seen = new Set();
    let n = 0;
    const add = (fr) => { if (fr && !seen.has(fr)) { seen.add(fr); n += fr.bytes || 0; } };
    ring.forEach(add);
    for (const p of pending) { p.pre.forEach(add); p.post.forEach(add); }
    if (best) best.frames.forEach(add);
    return n;
  };
  const trim = () => {
    const cap = R().MAX_BYTES, keep = Math.ceil((R().PRE + 0.4) * R().FPS);
    while (ring.length > keep) ring.shift();
    let guard = 400;
    while (bytes() > cap && guard-- > 0) {
      if (pending.length > 1) { // the lightest clip still being filmed goes first
        let li = 0;
        pending.forEach((p, i) => { if (p.m.weight < pending[li].m.weight) li = i; });
        pending.splice(li, 1);
      } else if (ring.length > 4) ring.shift();
      else if (pending.length) pending.pop();
      else { best = null; break; }
    }
  };

  // ---- clips ----
  const finish = (p) => {
    const i = pending.indexOf(p);
    if (i >= 0) pending.splice(i, 1);
    const frames = p.pre.concat(p.post);
    if (frames.length < 4 || !p.pre.length) return;
    const t0 = frames[0].t, mark = Math.max(0, p.pre.length - 1);
    const clip = {
      n: p.m.n, kind: p.m.kind, weight: p.m.weight, who: p.m.who, crew: p.m.crew, stop: p.m.stop, env: p.m.env, fps: R().FPS,
      frames, mark, t0, tm: Math.max(0, frames[mark].t - t0), len: Math.max(0.1, frames[frames.length - 1].t - t0), palette: palette.map((q) => ({ ...q })),
    };
    if (!best || clip.weight > best.weight) { best = clip; trim(); }
  };

  const step = (dt) => {
    if (!live() || !(dt > 0)) return;
    clock += dt;
  };
  // A frame is due when a 1/FPS has passed since the last one (the TV asks once per picture it draws).
  const wants = () => live() && clock > 0 && clock - lastGrab >= 1 / R().FPS - 1e-9;
  const push = (fr) => {
    if (!live() || !fr) return null;
    const every = 1 / R().FPS;
    lastGrab += every;
    if (clock - lastGrab > every) lastGrab = clock; // (a long gap does not make a burst of frames)
    const f = fr;
    f.t = Math.round(clock * 1000) / 1000;
    f.i = ++frameNo;
    f.bytes = f.bytes || R().CAP.EST_BYTES;
    f.P = f.P || [];
    ring.push(f);
    for (const p of pending.slice()) { p.post.push(f); if (p.post.length >= p.need) finish(p); }
    trim();
    return f;
  };
  const mark = (m) => {
    const K = R();
    if (!K.ENABLED || !m || !(m.weight >= K.MIN_WEIGHT) || !m.who || !m.who.length) return;
    if (best && best.weight >= m.weight) return; // (a heavier moment is already filmed: this one can never be the stop's top)
    if (pending.some((p) => p.m.weight >= m.weight)) return;
    if (!ring.length) return;
    const crew = ((m.data && m.data.crew) || []).map((c) => ({ name: c.name, color: c.color, species: c.species }));
    pending.push({ m: { n: m.n, kind: m.kind, weight: m.weight, who: m.who.slice(), crew, stop: m.stop, env: m.env }, pre: ring.slice(-Math.ceil(K.PRE * K.FPS)), post: [], need: Math.ceil(K.POST * K.FPS) });
    while (pending.length > K.MAX_PENDING) {
      let li = 0;
      pending.forEach((p, i) => { if (p.m.weight < pending[li].m.weight) li = i; });
      pending.splice(li, 1);
    }
    trim();
  };
  const reset = () => {
    ring = []; pending = []; best = null; clock = 0; lastGrab = 0; frameNo = 0;
    ids.clear(); palette = [];
  };
  // The clip of moment n (the stop's top moment), or null; the stop is then forgotten.
  const take = (n) => {
    for (const p of pending.slice()) finish(p); // (the stop ended before the last seconds were filmed: what there is will do)
    const clip = best && best.n === n ? best : null;
    reset();
    return clip;
  };
  const stats = () => ({ frames: ring.length, pending: pending.length, bytes: bytes(), best: best ? { n: best.n, kind: best.kind, frames: best.frames.length } : null, clock, pushed: frameNo });
  return { step, wants, push, crewFrame, mark, take, reset, stats };
}

// ---- playback: pure functions of a clip ----
// The film's speed at clip time u: LEAD x near the start and end, KEY x in the middle of the moment (eased within EASE s).
export function speedAt(clip, u) {
  const S = config.REPLAY.SPEED, d = Math.abs(u - clip.tm);
  return S.LEAD + (S.KEY - S.LEAD) * (1 - smooth(d / Math.max(0.05, S.EASE)));
}
export const createFilm = (clip) => {
  const film = { clip, u: 0, done: false, real: 0, skipped: false, ready: true, failed: false, wait: 0, src: null };
  if (footage.loader) {
    film.ready = false;
    try { footage.loader(film); } catch { film.failed = true; }
  }
  return film;
};
// Let go of the decoded pictures and the JPEGs (the film is over).
export function closeFilm(film) {
  if (!film) return film;
  try { if (film.src && film.src.close) film.src.close(); } catch { /* ignore */ }
  film.src = null;
  if (film.clip && film.clip.frames) for (const f of film.clip.frames) { f.blob = null; f.pr = null; }
  return film;
}
// Advance by dt real seconds. Returns the film. A film whose pictures are not decoded yet waits (at most REPLAY.LOAD.WAIT s, then it is dropped and the awards come at once).
export function stepFilm(film, dt) {
  if (film.done) return film;
  if (!film.ready) {
    film.wait += dt;
    if (film.failed || film.wait > config.REPLAY.LOAD.WAIT) { film.done = true; film.skipped = true; closeFilm(film); }
    return film;
  }
  film.real += dt;
  film.u += dt * speedAt(film.clip, film.u);
  if (film.u >= film.clip.len) { film.u = film.clip.len; film.done = true; closeFilm(film); }
  return film;
}
export function skipFilm(film) { if (film && !film.done) { film.done = true; film.skipped = true; closeFilm(film); } return film; }
// The film at clip time u: the two frames round it (a, b: their indexes ai, bi) and how far between (k).
export function sampleClip(clip, u) {
  const fr = clip.frames, n = fr.length, t = clip.t0 + clamp(u, 0, clip.len);
  let i = 0;
  while (i < n - 2 && fr[i + 1].t <= t) i++;
  const a = fr[i], b = fr[Math.min(n - 1, i + 1)], span = b.t - a.t;
  return { ai: i, bi: Math.min(n - 1, i + 1), a, b, k: span > 1e-6 ? clamp((t - a.t) / span, 0, 1) : 0 };
}
