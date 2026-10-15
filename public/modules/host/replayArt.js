// PLAY OF THE MISSION on the TV (SHIPS_BOOK.md L7): the replay of the stop's top moment, played on the scorecard in slow motion. replay.js records the numbers; this draws what sampleClip() says as a hand-inked
// film in a logbook page: a sky in the stop's colours, our ship and the enemy's as flat ink silhouettes (the layout's hull blocks and gasbags), the crew as round coloured markers (the people who made the play
// ringed in gold and named), the enemies, shots, fires, flashes and the creature's tubes, under the film's own camera (replay.js buildCam), then the caption ribbon (logArt.js playRibbon) and a skip hint.
// Everything is a pure function of the film and the clip: no random numbers, no sine of time (the film's grain jumps on the 8 fps key), nothing written to the game. Logical 1600 x 900; text 22 px or more.
//   const art = createReplayArt({ ctx, book, logArt })
//   art.draw(film, { play, shipName })      the whole scorecard page while a film plays
import { config } from '../../config.js';
import { sampleClip, speedAt, FOE, SHOT } from './replay.js';

const TAU = Math.PI * 2;
const hash = (n) => { let h = Math.imul(n + 1, 2654435761) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; };
const CREATURE_COLOR = { kraken: '#6b3f7a', drake: '#a8432f', thunderbird: '#3f6f9a', titan: '#7b7466', wyrm: '#7fb0c9', mother: '#6e8f4a', eel: '#2f2a5a' };

export function createReplayArt({ ctx, book, logArt }) {
  const A = config.REPLAY.ART, LB = config.LOGBOOK, F = config.FONTS;
  const INK = () => config.INK || LB.INK;
  const safe = (fn) => {
    ctx.save();
    try { fn(); } catch (e) { (globalThis.gameErrors = globalThis.gameErrors || []).push('replayArt: ' + e.message); }
    try { ctx.restore(); } catch (e2) { /* ignore */ }
  };
  const skyOf = (env) => {
    const E = config.ENVIRONMENTS && config.ENVIRONMENTS[env];
    return E && Array.isArray(E.sky) && E.sky.length >= 2 ? E.sky.map((c) => (String(c).startsWith('#') ? c : '#' + c)) : ['#7fb6d9', '#a9d0e4', '#efe6c8'];
  };
  const lerp = (p, q, k) => p + (q - p) * k;

  // ---- the frame, smoothed between two keys ----
  // Ships and crew are matched between the two frames (by slot / by person) and slid; creatures slide when the two frames have the same bones; everything else keeps its place and moves by its own velocity.
  const view = (s, clip) => {
    const { a, b, k } = s, dt = k / clip.fps;
    const ships = a.S.map((e) => {
      const q = b.S.find((o) => o[0] === e[0]);
      return q ? { slot: e[0], x: lerp(e[1], q[1], k), y: lerp(e[2], q[2], k), f: e[3], pitch: lerp(e[4], q[4], k), hull: e[5], down: e[6] } : { slot: e[0], x: e[1], y: e[2], f: e[3], pitch: e[4], hull: e[5], down: e[6] };
    });
    const crew = a.C.map((e) => {
      const q = b.C.find((o) => o[0] === e[0]);
      return q ? { who: e[0], x: lerp(e[1], q[1], k), y: lerp(e[2], q[2], k), fl: e[3] } : { who: e[0], x: e[1], y: e[2], fl: e[3] };
    });
    let cr = null;
    if (a.R) {
      cr = a.R;
      if (b.R && b.R.p.length === a.R.p.length && b.R.p.every((r, i) => r.length === a.R.p[i].length)) {
        cr = { ...a.R, p: a.R.p.map((r, i) => r.map((v, j) => (j === 0 ? v : lerp(v, b.R.p[i][j], k)))) };
      }
    }
    const slide = (list) => list.map((o) => ({ code: o[0], x: o[1] + o[3] * dt, y: o[2] + o[4] * dt, vx: o[3], vy: o[4] }));
    return { ships, crew, cr, foes: slide(a.F), shots: slide(a.B), flashes: k < 0.7 ? a.X : [], fires: a.K };
  };

  // ---- the scene, in world coordinates (the caller has set the camera) ----
  const clouds = (s, z, W, H) => {
    const cell = 1500, x0 = Math.floor((s.cx - W / z / 2) / cell) - 1, x1 = Math.floor((s.cx + W / z / 2) / cell) + 1;
    const y0 = Math.floor((s.cy - H / z / 2) / 900) - 1, y1 = Math.floor((s.cy + H / z / 2) / 900) + 1;
    ctx.fillStyle = 'rgba(255,250,236,0.55)';
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      const h = hash(gx * 73 + gy * 151);
      if (h < 0.45) continue;
      const cx = (gx + hash(gx * 3 + gy * 7)) * cell, cy = (gy + hash(gx * 11 + gy * 5)) * 900, r = 150 + h * 190;
      for (const [dx, dy, rr] of [[0, 0, 1], [0.9, 0.2, 0.75], [-0.85, 0.25, 0.7]]) { ctx.beginPath(); ctx.ellipse(cx + dx * r, cy + dy * r * 0.4, r * rr, r * rr * 0.42, 0, 0, TAU); ctx.fill(); }
    }
  };
  const ship = (e, st, z) => {
    const ow = 5 / z; // an outline of 5 screen px
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.f === -1) { ctx.translate(st.pivot, 0); ctx.scale(-1, 1); ctx.translate(-st.pivot, 0); }
    ctx.translate(st.tilt[0], st.tilt[1]);
    ctx.rotate(e.pitch || 0);
    ctx.translate(-st.tilt[0], -st.tilt[1]);
    const isFoe = st.foe;
    const hullC = e.down ? '#8a8378' : isFoe ? '#4a4346' : '#a5714a', bagC = e.down ? '#a39b8d' : isFoe ? '#7c3a36' : '#ecdcb6', ink = INK();
    ctx.lineJoin = 'round';
    ctx.fillStyle = ink;
    for (const g of st.bags) { ctx.beginPath(); ctx.ellipse(g.cx, g.cy, g.rx + ow, g.ry + ow, 0, 0, TAU); ctx.fill(); }
    for (const r of st.rects) { ctx.beginPath(); ctx.roundRect(r.x0 - ow, r.y0 - ow, r.x1 - r.x0 + 2 * ow, r.y1 - r.y0 + 2 * ow, 60 + ow); ctx.fill(); }
    ctx.fillStyle = bagC;
    for (const g of st.bags) { ctx.beginPath(); ctx.ellipse(g.cx, g.cy, g.rx, g.ry, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = hullC;
    for (const r of st.rects) { ctx.beginPath(); ctx.roundRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, 60); ctx.fill(); }
    ctx.strokeStyle = isFoe ? '#8c8284' : '#5c3d22'; // the decks
    ctx.lineWidth = 3 / z;
    ctx.beginPath();
    for (const d of st.decks) { ctx.moveTo(d[0], d[2]); ctx.lineTo(d[1], d[2]); }
    ctx.stroke();
    ctx.restore();
    if (e.hull < 0.35 && !e.down) { // a ship in trouble smokes: a stepped dark puff over her middle
      ctx.fillStyle = 'rgba(43,34,22,0.55)';
      const sx = e.f === 1 ? e.x + st.mid.x : e.x + st.pivot + e.f * (st.mid.x - st.pivot);
      ctx.beginPath(); ctx.ellipse(sx, e.y + st.bounds.y0 - 120, 150, 90, 0, 0, TAU); ctx.fill();
    }
  };
  const creature = (cr, z) => {
    const body = CREATURE_COLOR[cr.k] || '#6b4a5a', ink = INK();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const pass of [0, 1]) {
      for (const row of cr.p) {
        for (let i = 1; i + 5 < row.length; i += 3) {
          const r = Math.max(8 / z, Math.min(row[i + 2], row[i + 5]) * 0.5 + Math.abs(row[i + 2] - row[i + 5]) * 0.25 + 4);
          ctx.strokeStyle = pass ? (cr.dying ? '#9d958a' : body) : ink;
          ctx.lineWidth = Math.max(5 / z, 2 * r + (pass ? 0 : 10 / z));
          ctx.beginPath(); ctx.moveTo(row[i], row[i + 1]); ctx.lineTo(row[i + 3], row[i + 4]); ctx.stroke();
        }
      }
    }
  };
  const plane = (o, size, color, z) => {
    const s = Math.max(size, 24 / z), d = o.vx < 0 ? -1 : 1;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(d, 1);
    ctx.fillStyle = color; ctx.strokeStyle = INK(); ctx.lineWidth = 3 / z; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.62, s * 0.2, 0, 0, TAU); ctx.fill(); ctx.stroke(); // the body
    ctx.beginPath(); ctx.moveTo(-s * 0.1, 0); ctx.lineTo(-s * 0.42, -s * 0.46); ctx.lineTo(s * 0.12, -s * 0.04); ctx.closePath(); ctx.fill(); ctx.stroke(); // a wing
    ctx.beginPath(); ctx.moveTo(-s * 0.55, 0); ctx.lineTo(-s * 0.74, -s * 0.3); ctx.lineTo(-s * 0.4, -s * 0.05); ctx.closePath(); ctx.fill(); ctx.stroke(); // the tail
    ctx.restore();
  };
  const foe = (o, z) => {
    const ink = INK();
    if (o.code === FOE.fighter || o.code === FOE.strafer) plane(o, 90, o.code === FOE.fighter ? '#b3453d' : '#7a6a9a', z);
    else if (o.code === FOE.bomber) plane(o, 170, '#5a5a62', z);
    else if (o.code === FOE.boss) {
      ctx.fillStyle = '#4a4346'; ctx.strokeStyle = ink; ctx.lineWidth = 5 / z;
      ctx.beginPath(); ctx.ellipse(o.x, o.y - 40, 520, 150, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#7c3a36';
      ctx.beginPath(); ctx.roundRect(o.x - 300, o.y + 40, 600, 130, 40); ctx.fill(); ctx.stroke();
    } else if (o.code === FOE.para) {
      ctx.strokeStyle = ink; ctx.lineWidth = 3 / z; ctx.fillStyle = '#e8d9b0';
      ctx.beginPath(); ctx.arc(o.x, o.y - 70, Math.max(46, 20 / z), Math.PI, 0); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4a4346'; ctx.beginPath(); ctx.arc(o.x, o.y, Math.max(16, 8 / z), 0, TAU); ctx.fill(); ctx.stroke();
    } else {
      const r = Math.max(o.code === FOE.mine ? 34 : o.code === FOE.tug ? 60 : 26, 10 / z);
      ctx.fillStyle = o.code === FOE.mine ? '#3b3b44' : o.code === FOE.imp ? '#c0453f' : o.code === FOE.saw ? '#9aa0a8' : '#6a5a4a';
      ctx.strokeStyle = ink; ctx.lineWidth = 3 / z;
      ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, TAU); ctx.fill(); ctx.stroke();
    }
  };
  const shot = (o, z) => {
    const ink = INK();
    if (o.code === SHOT.shell || o.code === SHOT.bullet) {
      const len = Math.hypot(o.vx, o.vy) || 1, tail = Math.max(0.05, 40 / len);
      ctx.lineCap = 'round';
      ctx.strokeStyle = ink; ctx.lineWidth = 9 / z; ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x - o.vx * tail, o.y - o.vy * tail); ctx.stroke();
      ctx.strokeStyle = o.code === SHOT.shell ? '#ffd23f' : '#e63946'; ctx.lineWidth = 5 / z; ctx.stroke();
    } else if (o.code === SHOT.thrown) {
      ctx.fillStyle = '#8a6a3a'; ctx.strokeStyle = ink; ctx.lineWidth = 3 / z;
      const r = Math.max(26, 9 / z);
      ctx.beginPath(); ctx.roundRect(o.x - r, o.y - r, 2 * r, 2 * r, 8); ctx.fill(); ctx.stroke();
    } else {
      const r = Math.max(o.code === SHOT.bomb ? 34 : 26, 9 / z);
      ctx.fillStyle = o.code === SHOT.bomb ? '#2b2622' : '#6a4a3a'; ctx.strokeStyle = ink; ctx.lineWidth = 3 / z;
      ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff9a3c'; ctx.beginPath(); ctx.arc(o.x, o.y - r * 1.25, r * 0.28, 0, TAU); ctx.fill(); // the fuse
    }
  };
  const star = (x, y, r, color, z) => {
    ctx.beginPath();
    for (let i = 0; i < 16; i++) { const rr = i % 2 ? r * 0.45 : r, a = (i / 16) * TAU; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = INK(); ctx.lineWidth = 3 / z; ctx.stroke();
  };
  const flame = (x, y, z) => {
    const h = Math.max(70, 26 / z);
    ctx.fillStyle = '#ff7b1c'; ctx.strokeStyle = INK(); ctx.lineWidth = 3 / z;
    ctx.beginPath(); ctx.moveTo(x - h * 0.3, y); ctx.quadraticCurveTo(x - h * 0.35, y - h * 0.6, x, y - h); ctx.quadraticCurveTo(x + h * 0.4, y - h * 0.5, x + h * 0.3, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.ellipse(x, y - h * 0.3, h * 0.13, h * 0.24, 0, 0, TAU); ctx.fill();
  };

  // ---- the window ----
  const scene = (film, s, v) => {
    const clip = film.clip, { X, Y, W, H } = A, z = s.z;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(X, Y, W, H, 14); ctx.clip();
    const cols = skyOf(clip.env), g = ctx.createLinearGradient(0, Y, 0, Y + H);
    cols.forEach((c, i) => g.addColorStop(i / (cols.length - 1), c));
    ctx.fillStyle = g; ctx.fillRect(X, Y, W, H);
    ctx.save();
    ctx.translate(X + W / 2, Y + H / 2); ctx.scale(z, z); ctx.translate(-s.cx, -s.cy);
    clouds(s, z, W, H);
    if (v.cr) creature(v.cr, z);
    const staticOf = (e) => clip.statics[e.slot];
    for (const e of v.ships) if (staticOf(e) && staticOf(e).foe) ship(e, staticOf(e), z);
    for (const e of v.ships) if (staticOf(e) && !staticOf(e).foe) ship(e, staticOf(e), z);
    for (const o of v.foes) foe(o, z);
    for (const o of v.fires) flame(o[0], o[1], z);
    for (const o of v.shots) shot(o, z);
    const names = new Set(clip.who || []);
    for (const c of v.crew) { // the crew: round markers in their own colours, those who made the play ringed in gold
      const p = clip.palette[c.who] || { name: '', color: '#e8d9b0' }, hero = names.has(p.name), r = Math.max(hero ? 16 : 12, (hero ? 18 : 12) / z);
      if (hero) { ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 6 / z; ctx.beginPath(); ctx.arc(c.x, c.y, r + 12 / z, 0, TAU); ctx.stroke(); }
      ctx.fillStyle = c.fl & 1 ? '#9d958a' : p.color; ctx.strokeStyle = INK(); ctx.lineWidth = 3.5 / z;
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, TAU); ctx.fill(); ctx.stroke();
      if (c.fl & 2) { ctx.fillStyle = '#8a6a3a'; ctx.beginPath(); ctx.rect(c.x - r * 0.5, c.y - r * 1.9, r, r * 0.9); ctx.fill(); ctx.stroke(); }
      if (c.fl & 4) { ctx.strokeStyle = INK(); ctx.beginPath(); ctx.arc(c.x, c.y - r * 2, r * 1.3, Math.PI, 0); ctx.stroke(); }
    }
    for (const o of v.flashes) star(o[0], o[1], 70 * Math.max(0.6, o[2]), '#fff2cf', z);
    ctx.restore();
    // names over the people who made the play (screen space, so the type is the same size at any zoom)
    const tm = clip.mark / clip.fps, pulse = Math.abs(film.u - tm) < 0.6;
    for (const c of v.crew) {
      const p = clip.palette[c.who];
      if (!p || !names.has(p.name)) continue;
      let sx = X + W / 2 + (c.x - s.cx) * z, sy = Y + H / 2 + (c.y - s.cy) * z;
      if (pulse) { ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(sx, sy, 34 + 22 * (Math.floor(film.u * 8) % 4), 0, TAU); ctx.stroke(); } // (rings that jump out on the 8 fps key)
      if (sx > X + 40 && sx < X + W - 40 && sy > Y + 40 && sy < Y + H - 20) { // his own head in a gold ring over the marker
        const ref = (clip.crew || []).find((q) => q.name === p.name) || { name: p.name, color: p.color };
        logArt.head(ref, sx, sy, 30);
        ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(sx, sy, 34, 0, TAU); ctx.stroke();
      }
      ctx.font = `700 24px ${F.TEXT}`;
      ctx.textAlign = 'center';
      sx = Math.max(X + 70, Math.min(X + W - 70, sx));
      sy = sy - 46 < Y + 70 ? Math.min(Y + H - 24, sy + 68) : Math.min(Y + H - 24, sy - 46); // (under his head when there is no room above it)
      ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = INK(); ctx.strokeText(p.name, sx, sy);
      ctx.fillStyle = p.color; ctx.fillText(p.name, sx, sy);
    }
    // a faded paper wash and a dark rim, grain that jumps on the key
    ctx.fillStyle = 'rgba(243,234,214,0.10)'; ctx.fillRect(X, Y, W, H);
    const vg = ctx.createRadialGradient(X + W / 2, Y + H / 2, H * 0.35, X + W / 2, Y + H / 2, W * 0.62);
    vg.addColorStop(0, 'rgba(43,34,22,0)'); vg.addColorStop(1, 'rgba(43,34,22,0.5)');
    ctx.fillStyle = vg; ctx.fillRect(X, Y, W, H);
    const key = Math.floor(film.u * 8);
    ctx.strokeStyle = 'rgba(255,250,236,0.16)'; ctx.lineWidth = 2;
    for (let j = 0; j < 4; j++) { const gx = X + hash(key * 7 + j) * W; ctx.beginPath(); ctx.moveTo(gx, Y); ctx.lineTo(gx + (hash(key + j * 5) - 0.5) * 18, Y + H); ctx.stroke(); }
    ctx.restore();
    // the frame
    ctx.strokeStyle = INK(); ctx.lineWidth = 7; ctx.beginPath(); ctx.roundRect(X, Y, W, H, 14); ctx.stroke();
    // the tags inside the window
    const sp = speedAt(clip, film.u);
    ctx.font = `700 24px ${F.TEXT}`;
    const tag = `SLOW MOTION  x${sp.toFixed(1)}`;
    ctx.fillStyle = 'rgba(43,34,22,0.82)'; ctx.beginPath(); ctx.roundRect(X + 18, Y + 16, ctx.measureText(tag).width + 36, 42, 12); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.textAlign = 'left'; ctx.fillText(tag, X + 36, Y + 45);
    ctx.fillStyle = 'rgba(43,34,22,0.82)'; ctx.beginPath(); ctx.roundRect(X + W - 178, Y + 16, 160, 42, 12); ctx.fill();
    if (Math.floor(film.u * 2) % 2 === 0) { ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.arc(X + W - 154, Y + 37, 9, 0, TAU); ctx.fill(); } // (a recording light that blinks on the half second)
    ctx.fillStyle = '#f3ead6'; ctx.fillText('REPLAY', X + W - 136, Y + 45);
  };

  const draw = (film, opts = {}) => safe(() => {
    const { X, Y, W, H } = A, clip = film.clip, s = sampleClip(clip, film.u), v = view(s, clip);
    ctx.fillStyle = 'rgba(43,34,22,.7)';
    ctx.fillRect(-config.W, -config.H, config.W * 3, config.H * 3);
    book.paper(80, 56, 1440, 788, { r: 22 });
    ctx.textAlign = 'center';
    if (opts.shipName) { ctx.font = `700 22px ${F.TEXT}`; ctx.fillStyle = LB.INK_SOFT; ctx.fillText(String(opts.shipName).toUpperCase(), 800, 98, 900); }
    ctx.font = `49px ${F.DISPLAY}`;
    ctx.fillStyle = LB.STAMP;
    ctx.fillText('THE REPLAY', 800, 150);
    scene(film, s, v);
    const pw = 1000; // the film strip under the window: how far the clip has played
    ctx.fillStyle = 'rgba(107,74,50,0.25)'; ctx.fillRect(X, Y + H + 10, W, 8);
    ctx.fillStyle = LB.STAMP; ctx.fillRect(X, Y + H + 10, W * Math.min(1, film.u / Math.max(0.1, clip.len)), 8);
    if (opts.play) logArt.playRibbon(opts.play, 800, Y + H + 28, pw + 120);
    ctx.textAlign = 'center';
    ctx.font = `700 ${A.MIN_PX}px ${F.TEXT}`;
    ctx.fillStyle = LB.INK_SOFT;
    ctx.fillText(A.HINT, 800, 826);
  });

  return { draw, view };
}
