// PLAY OF THE MISSION, the recorder (SHIPS_BOOK.md L7). While a stop is flown this keeps a short rolling film of the sky as SMALL NUMBERS, not as the sim's objects: the ships' poses, where each crewman is, the enemies,
// the shots, the fires, the creature's segments (config.REPLAY.FPS frames a second, the last PRE seconds). When a moment that weighs REPLAY.MIN_WEIGHT is recorded (moments.js onMoment) it starts a CLIP: the frames
// before it (shared, not copied) and POST seconds of the frames after it. At the stop's end take(n) gives the clip of the stop's top moment (the Log's "play of the mission"), and replayArt.js plays it on the scorecard.
// VIEW ONLY: this file reads the world and writes nothing to it, draws no random number and keeps nothing the sim reads. Memory is capped (REPLAY.MAX_BYTES); a clip that does not fit is dropped.
// Node-safe: no DOM.
//
//   const replay = createReplay({ world })
//   replay.step(dt)         once per flying step (simulation.js, beside moments.tick): the clock, a frame every 1/FPS s
//   replay.mark(m)          a moment was recorded (moments.js onMoment): a heavy one starts a clip
//   replay.take(n)          the clip of moment number n (or null), then forget the stop (call it when the stop's Log is written)
//   replay.reset()          forget everything (a new voyage)
//   replay.stats()          { frames, pending, bytes, best } for the gates
//   createFilm(clip) / stepFilm(film, dt) / skipFilm(film) / sampleClip(clip, u) / speedAt(clip, u)   playback (pure functions of the clip: replayArt.js draws what sampleClip returns)
//
// A FRAME (plain arrays, so it is cheap to make and to keep):
//   { t, n,                                   the clock in seconds, how many numbers it holds (for the memory estimate)
//     S: [[slot, x, y, f, pitch, hull, flags]],    ships (flags 1 = down); slot indexes clip.statics
//     C: [[who, x, y, flags]],                crew, who indexes clip.palette (flags 1 = knocked out, 2 = carrying a load, 4 = in the air)
//     F: [[code, x, y, vx, vy]],              enemies (FOE codes below)
//     B: [[code, x, y, vx, vy]],              shots and bombs (SHOT codes below)
//     X: [[x, y, size]],  K: [[x, y]],        explosions' flashes, fires
//     R: null | { k, x, y, f, hp, dying, p: [[part kind, x, y, r, x, y, r ...]] } the creature }
import { config } from '../../config.js';
import { shipOf } from './ships.js';
import { toWorld, pivotOf } from './pose.js';

export const FOE = { fighter: 1, bomber: 2, strafer: 3, para: 4, bat: 5, imp: 6, saw: 7, sniper: 8, tug: 9, rocket: 10, mine: 11, boss: 12 };
export const SHOT = { shell: 1, bullet: 2, enemyBomb: 3, bomb: 4, thrown: 5 };
const CARRY_LOADS = ['ammo', 'coal', 'sandbag', 'crate', 'chest', 'scrap'];
const PART_CODE = { tentacle: 1, wing: 1, neck: 1, head: 2, mouth: 3, eye: 4, heart: 4, mantle: 0, body: 0 };
const finite = (n) => Number.isFinite(n);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (x) => { const u = clamp(x, 0, 1); return u * u * (3 - 2 * u); };

export function createReplay({ world }) {
  const R = () => config.REPLAY;
  let ring = []; // the rolling frames, oldest first
  let pending = []; // clips still waiting for their last seconds: { m, pre, post, need }
  let best = null; // the heaviest finished clip of this stop
  let clock = 0, acc = 0;
  const ids = new Map(); // player id -> palette index (this stop)
  let palette = []; // [{ name, color }]
  const slots = new Map(); // a ship's layout object -> slot (this stop)
  let statics = []; // [{ id, main, foe, pivot, bounds, mid, tilt, bags, rects, decks, color }]
  let frameNo = 0;

  // ---- what a ship looks like (once per ship per stop) ----
  const staticOf = (sh) => {
    const L = sh.layout || {};
    const num = (v, d = 0) => (finite(v) ? v : d);
    const b = L.bounds || { x0: 0, x1: 1600, y0: -150, y1: 950 };
    return {
      id: sh.id, main: !!sh.main, foe: !!sh.ai, pivot: num(pivotOf(sh)),
      bounds: { x0: num(b.x0), x1: num(b.x1), y0: num(b.y0), y1: num(b.y1) },
      mid: { x: num(L.midPoint && L.midPoint.x, 800), y: num(L.midPoint && L.midPoint.y, 470) },
      tilt: [num(L.tiltPivot && L.tiltPivot[0], 800), num(L.tiltPivot && L.tiltPivot[1], 520)],
      bags: (L.gasbags || []).slice(0, 4).map((g) => ({ cx: num(g.cx), cy: num(g.cy), rx: num(g.rx, 100), ry: num(g.ry, 60) })),
      rects: (L.hitRects || []).slice(0, 8).map((r) => ({ x0: num(r.x0), y0: num(r.y0), x1: num(r.x1), y1: num(r.y1) })),
      decks: (L.platforms || []).slice(0, 10).filter((p) => finite(p.y) && finite(p.x0) && finite(p.x1)).map((p) => [p.x0, p.x1, p.y]),
    };
  };
  const slotOf = (sh) => {
    let i = slots.get(sh.layout);
    if (i === undefined) {
      if (statics.length >= R().CAPS.SLOTS) return -1;
      i = statics.length;
      slots.set(sh.layout, i);
      statics.push(staticOf(sh));
    }
    return i;
  };
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

  // ---- one frame ----
  const snap = () => {
    const C = R().CAPS, f = { t: Math.round(clock * 100) / 100, n: 0, S: [], C: [], F: [], B: [], X: [], K: [], R: null };
    const r1 = (v) => Math.round(v * 10) / 10, r0 = Math.round;
    for (const sh of world.ships || []) {
      if (f.S.length >= C.SHIPS) break;
      if (!sh || !sh.pose || sh.gone || !finite(sh.pose.x) || !finite(sh.pose.y)) continue;
      const slot = slotOf(sh);
      if (slot < 0) continue;
      const hull = sh.ctx && sh.ctx.ship ? clamp((sh.ctx.ship.hull || 0) / 100, 0, 1) : 1;
      f.S.push([slot, r1(sh.pose.x), r1(sh.pose.y), sh.pose.f === -1 ? -1 : 1, Math.round((sh.pose.pitch || 0) * 1000) / 1000, Math.round(hull * 100) / 100, sh.ctx && sh.ctx.ship && sh.ctx.ship.down ? 1 : 0]);
    }
    for (const p of Object.values(world.players || {})) {
      if (f.C.length >= C.CREW) break;
      if (!p || p.mate || p.enemy || p.connected === false || p.hj || (p.on && p.on.away)) continue;
      let x, y;
      if (p.fly) { x = p.x; y = p.y; } else {
        if (p.d == null) continue;
        const w = toWorld(shipOf(world, p), p.x, p.y - 50);
        x = w.x; y = w.y;
      }
      if (!finite(x) || !finite(y)) continue;
      const i = whoIdx(p);
      if (i < 0) continue;
      f.C.push([i, r0(x), r0(y), (p.ko > 0 ? 1 : 0) | (CARRY_LOADS.includes(p.carry) ? 2 : 0) | (p.fly ? 4 : 0)]);
    }
    const foe = (code, o) => { if (f.F.length < C.FOES && o && finite(o.x) && finite(o.y)) f.F.push([code, r0(o.x), r0(o.y), r0(o.vx || 0), r0(o.vy || 0)]); };
    const e = world.enemy;
    if (e && e.dead <= 0 && e !== world.stuntPlane) foe(FOE.fighter, e);
    for (const o of world.bombers || []) foe(FOE.bomber, o);
    for (const o of world.strafers || []) foe(FOE.strafer, o);
    for (const o of world.paras || []) foe(FOE.para, o);
    for (const o of world.bats || []) if (!o.latched) foe(FOE.bat, o);
    for (const o of world.rockets || []) foe(FOE.rocket, o);
    for (const o of world.mines || []) foe(FOE.mine, o);
    const SP = world.specials;
    if (SP) {
      for (const o of SP.imps || []) foe(FOE.imp, o);
      for (const o of SP.saws || []) foe(FOE.saw, o);
      for (const o of SP.snipers || []) foe(FOE.sniper, o);
      for (const o of SP.tugs || []) foe(FOE.tug, o);
    }
    if (world.boss) foe(FOE.boss, world.boss);
    const shot = (code, o) => { if (f.B.length < C.SHOTS && o && finite(o.x) && finite(o.y)) f.B.push([code, r0(o.x), r0(o.y), r0(o.vx || 0), r0(o.vy || 0)]); };
    for (const o of world.shells || []) shot(SHOT.shell, o);
    for (const o of world.bullets || []) shot(SHOT.bullet, o);
    for (const o of world.enemyBombs || []) shot(SHOT.enemyBomb, o);
    for (const o of world.shipBombs || []) shot(SHOT.bomb, o);
    for (const o of world.thrown || []) shot(SHOT.thrown, o);
    for (const o of world.flashes || []) if (!o.glow && f.X.length < C.FLASHES && finite(o.x) && finite(o.y)) f.X.push([r0(o.x), r0(o.y), Math.round((o.size || 1) * 10) / 10]);
    for (const sh of world.ships || []) {
      if (f.K.length >= C.FIRES) break;
      if (!sh || !sh.pose || !sh.ctx || !sh.layout || sh.ai) continue;
      for (const fi of sh.ctx.fires || []) {
        const pl = sh.layout.platforms && sh.layout.platforms[fi.d];
        if (!pl || !finite(fi.x) || f.K.length >= C.FIRES) continue;
        const w = toWorld(sh, fi.x, pl.y - 30);
        f.K.push([r0(w.x), r0(w.y)]);
      }
    }
    const cr = world.creature;
    if (cr && Array.isArray(cr.parts) && finite(cr.x) && finite(cr.y)) {
      const out = { k: String(cr.kind || ''), x: r0(cr.x), y: r0(cr.y), f: cr.f === -1 ? -1 : 1, hp: cr.maxHp > 0 ? Math.round(clamp(cr.hp / cr.maxHp, 0, 1) * 100) / 100 : 1, dying: cr.dying ? 1 : 0, p: [] };
      let segs = 0;
      for (const part of cr.parts.slice(0, C.PARTS)) {
        if (!part || part.hidden || part.severed || !Array.isArray(part.segs) || !part.segs.length || segs >= C.SEGS) continue;
        const row = [PART_CODE[part.kind] || 0];
        for (const s of part.segs) {
          if (segs >= C.SEGS || !finite(s.x) || !finite(s.y)) break;
          row.push(r0(s.x), r0(s.y), r0(s.r || 20));
          segs++;
        }
        const last = part.segs[Math.min(part.segs.length, row.length / 3) - 1];
        if (last && finite(last.ang) && finite(last.len)) row.push(r0(last.x + Math.cos(last.ang) * last.len), r0(last.y + Math.sin(last.ang) * last.len), r0(last.r1 != null ? last.r1 : last.r || 10)); // (the tip of the last segment)
        if (row.length >= 7) out.p.push(row);
      }
      f.R = out;
    }
    f.n = f.S.length * 7 + f.C.length * 4 + f.F.length * 5 + f.B.length * 5 + f.X.length * 3 + f.K.length * 2 + (f.R ? 8 + f.R.p.reduce((a, r) => a + r.length, 0) : 0) + 8;
    return f;
  };

  // ---- memory ----
  const bytes = () => {
    const seen = new Set();
    let n = 0;
    const add = (fr) => { if (fr && !seen.has(fr)) { seen.add(fr); n += fr.n; } };
    ring.forEach(add);
    for (const p of pending) { p.pre.forEach(add); p.post.forEach(add); }
    if (best) best.frames.forEach(add);
    return n * 8;
  };
  const trim = () => {
    const cap = R().MAX_BYTES, keep = Math.ceil((R().PRE + 0.4) * R().FPS);
    while (ring.length > keep) ring.shift();
    let guard = 40;
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
  // Where the camera looks in each frame: our ship, the thing she is fighting and the person who did it, eased (a critically damped follower, no overshoot) and pushed in a little on the moment.
  const buildCam = (clip) => {
    const K = R().CAM, A = R().ART, dt = 1 / clip.fps, alpha = 1 - Math.exp(-dt / K.TAU);
    const hero = clip.who && clip.who.length ? clip.palette.findIndex((q) => q.name === clip.who[0]) : -1;
    const cam = [];
    let cx = 0, cy = 0, lz = 0;
    clip.frames.forEach((f, i) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const grow = (x, y, r = 0) => { x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r); };
      const boxOf = (e) => {
        const st = clip.statics[e[0]], b = st.bounds, c = (sx) => (e[3] === 1 ? sx + e[1] : e[1] + st.pivot + e[3] * (sx - st.pivot));
        return [Math.min(c(b.x0), c(b.x1)), b.y0 + e[2], Math.max(c(b.x0), c(b.x1)), b.y1 + e[2]];
      };
      const mainE = f.S.find((e) => clip.statics[e[0]] && clip.statics[e[0]].main) || f.S[0];
      let mx = 0, my = 0;
      if (mainE) { const b = boxOf(mainE); grow(b[0], b[1]); grow(b[2], b[3]); mx = (b[0] + b[2]) / 2; my = (b[1] + b[3]) / 2; }
      const near = (x, y, range) => Math.hypot(x - mx, y - my) <= range;
      for (const e of f.S) { // another ship in range (the gunship she is fighting)
        if (e === mainE || !clip.statics[e[0]]) continue;
        const b = boxOf(e);
        if (near((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, K.FOE_RANGE)) { grow(b[0], b[1]); grow(b[2], b[3]); }
      }
      if (f.R && near(f.R.x, f.R.y, K.FOE_RANGE * 1.6)) grow(f.R.x, f.R.y, K.FOE_PAD * 1.6);
      let near1 = null, nd = K.FOE_RANGE;
      for (const o of f.F) { const d = Math.hypot(o[1] - mx, o[2] - my); if (d < nd) { nd = d; near1 = o; } }
      if (near1) grow(near1[1], near1[2], near1[0] === FOE.boss ? K.FOE_PAD * 1.6 : K.FOE_PAD * 0.5);
      if (hero >= 0) { const c = f.C.find((q) => q[0] === hero); if (c && (c[3] & 4)) grow(c[1], c[2], 260); } // (a crewman in the air is worth following)
      if (!isFinite(x0)) { x0 = x1 = 800; y0 = y1 = 400; }
      const bw = Math.max(400, x1 - x0) * K.PAD, bh = Math.max(300, y1 - y0) * K.PAD;
      const tz = clamp(Math.min(A.W / bw, A.H / bh), K.ZOOM_MIN, K.ZOOM_MAX);
      let tx = (x0 + x1) / 2, ty = (y0 + y1) / 2;
      if (mainE) { // when the zoom could not take everything in, our own ship stays whole in the window (the thing she fights fills what room is left)
        const b = boxOf(mainE), vw = A.W / tz, vh = A.H / tz, m = K.KEEP_SHIP;
        const hold = (c, lo0, hi0, vsz) => { const lo = hi0 - vsz * (0.5 - m), hi = lo0 + vsz * (0.5 - m); return lo <= hi ? clamp(c, lo, hi) : (lo0 + hi0) / 2; };
        tx = hold(tx, b[0], b[2], vw);
        ty = hold(ty, b[1], b[3], vh);
      }
      if (!i) { cx = tx; cy = ty; lz = Math.log(tz); } else { cx += (tx - cx) * alpha; cy += (ty - cy) * alpha; lz += (Math.log(tz) - lz) * alpha; }
      const push = 1 + K.PUSH * smooth(1 - Math.abs(i - clip.mark) / (K.PUSH_SECS * clip.fps));
      cam.push([Math.round(cx), Math.round(cy), Math.round(Math.exp(lz) * push * 10000) / 10000]);
    });
    return cam;
  };
  const finish = (p) => {
    const i = pending.indexOf(p);
    if (i >= 0) pending.splice(i, 1);
    const frames = p.pre.concat(p.post);
    if (frames.length < 4 || !p.pre.length) return;
    const clip = {
      n: p.m.n, kind: p.m.kind, weight: p.m.weight, who: p.m.who, crew: p.m.crew, stop: p.m.stop, env: p.m.env, fps: R().FPS,
      frames, mark: Math.max(0, p.pre.length - 1), len: (frames.length - 1) / R().FPS, palette: palette.map((q) => ({ ...q })), statics: statics.slice(), cam: null,
    };
    clip.cam = buildCam(clip);
    if (!best || clip.weight > best.weight) { best = clip; trim(); }
  };

  const step = (dt) => {
    if (!R().ENABLED || !(dt > 0) || (world.match && world.match.on)) return; // (Versus has no scorecard)
    clock += dt;
    acc += dt;
    const every = 1 / R().FPS;
    if (acc < every) return;
    acc = Math.min(acc - every, every); // (a long step does not make a burst of frames)
    const f = snap();
    f.i = ++frameNo;
    ring.push(f);
    for (const p of pending.slice()) { p.post.push(f); if (p.post.length >= p.need) finish(p); }
    trim();
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
    ring = []; pending = []; best = null; clock = 0; acc = 0; frameNo = 0;
    ids.clear(); palette = []; slots.clear(); statics = [];
  };
  // The clip of moment n (the stop's top moment), or null; the stop is then forgotten.
  const take = (n) => {
    for (const p of pending.slice()) finish(p); // (the stop ended before the last seconds were filmed: what there is will do)
    const clip = best && best.n === n ? best : null;
    reset();
    return clip;
  };
  const stats = () => ({ frames: ring.length, pending: pending.length, bytes: bytes(), best: best ? { n: best.n, kind: best.kind, frames: best.frames.length } : null, clock });
  return { step, mark, take, reset, stats };
}

// ---- playback: pure functions of a clip ----
// The film's speed at clip time u: LEAD x near the start and end, KEY x in the middle of the moment (eased within EASE s).
export function speedAt(clip, u) {
  const S = config.REPLAY.SPEED, tm = clip.mark / clip.fps, d = Math.abs(u - tm);
  return S.LEAD + (S.KEY - S.LEAD) * (1 - smooth(d / Math.max(0.05, S.EASE)));
}
export const createFilm = (clip) => ({ clip, u: 0, done: false, real: 0, skipped: false });
// Advance by dt real seconds. Returns the film.
export function stepFilm(film, dt) {
  if (film.done) return film;
  film.real += dt;
  film.u += dt * speedAt(film.clip, film.u);
  if (film.u >= film.clip.len) { film.u = film.clip.len; film.done = true; }
  return film;
}
export function skipFilm(film) { if (film && !film.done) { film.done = true; film.skipped = true; } return film; }
// The film at clip time u: the two frames round it and how far between (k), the camera there.
export function sampleClip(clip, u) {
  const fl = clip.frames.length;
  const x = clamp(u * clip.fps, 0, fl - 1), i = Math.min(fl - 2, Math.floor(x)), k = x - i;
  const a = clip.cam[i], b = clip.cam[Math.min(fl - 1, i + 1)];
  const lerp = (p, q) => p + (q - p) * k;
  return { a: clip.frames[i], b: clip.frames[Math.min(fl - 1, i + 1)], k, cx: lerp(a[0], b[0]), cy: lerp(a[1], b[1]), z: lerp(a[2], b[2]) };
}
