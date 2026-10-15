// PLAY OF THE MISSION on the TV (SHIPS_BOOK.md L7): the replay of the stop's top moment, played on the scorecard in slow motion. The picture is REAL FOOTAGE of the TV as it was (replayCam.js copied the 3D canvas
// into small JPEGs; film.src.at(i) hands back the decoded ones). This page is the logbook wrapped round it: THE REPLAY, the film strip with the picture in it, the hero ringed and named where they stood, the SLOW MOTION
// tag, the caption ribbon (logArt.js playRibbon) and the skip hint. Between two pictures the film dissolves (it plays at under half speed, the pictures are 1/15 s apart).
// Everything is a pure function of the film and the clip: no random numbers, no sine of time (the rings jump on the 8 fps key), nothing written to the game. Logical 1600 x 900; text 22 px or more.
//   const art = createReplayArt({ ctx, book, logArt })
//   art.draw(film, { play, shipName })      the whole scorecard page while a film plays
import { config } from '../../config.js';
import { sampleClip, speedAt } from './replay.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (p, q, k) => p + (q - p) * k;

export function createReplayArt({ ctx, book, logArt }) {
  const A = config.REPLAY.ART, LB = config.LOGBOOK, F = config.FONTS;
  const INK = () => config.INK || LB.INK;
  const safe = (fn) => {
    ctx.save();
    try { fn(); } catch (e) { (globalThis.gameErrors = globalThis.gameErrors || []).push('replayArt: ' + e.message); }
    try { ctx.restore(); } catch (e2) { /* ignore */ }
  };

  // where the picture sits: the TV's shape, fitted in the box
  const fit = (clip, a) => {
    const asp = a && a.w > 0 && a.h > 0 ? clamp(a.w / a.h, 1, 2.4) : 16 / 9;
    const maxW = A.W - 2 * A.STRIP;
    const pw = Math.min(maxW, A.H * asp), ph = pw / asp;
    return { x: A.X + (A.W - pw) / 2, y: A.Y + (A.H - ph) / 2, w: pw, h: ph };
  };

  // the film strip: a dark band with sprocket holes down both sides, the picture's window in the middle
  const strip = (r) => {
    const S = A.STRIP, ink = INK();
    ctx.fillStyle = '#2b2216';
    ctx.strokeStyle = ink; ctx.lineWidth = 5; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.roundRect(r.x - S, r.y - 10, r.w + 2 * S, r.h + 20, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e9dcba';
    const n = Math.max(4, Math.floor(r.h / 44));
    for (let i = 0; i < n; i++) {
      const y = r.y + (i + 0.5) * (r.h / n) - 9;
      ctx.beginPath(); ctx.roundRect(r.x - S + 9, y, 16, 18, 4); ctx.fill();
      ctx.beginPath(); ctx.roundRect(r.x + r.w + S - 25, y, 16, 18, 4); ctx.fill();
    }
  };

  // the footage: the picture before, the one after fading in over it
  const picture = (film, s, r) => {
    ctx.save();
    ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 6); ctx.clip();
    ctx.fillStyle = '#1d1812'; ctx.fillRect(r.x, r.y, r.w, r.h);
    const src = film.src;
    if (src) {
      try {
        src.want(s.ai, s.bi);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const pa = src.at(s.ai), pb = src.at(s.bi);
        if (pa) ctx.drawImage(pa, r.x, r.y, r.w, r.h);
        if (pb && pb !== pa && s.k > 0.02) { ctx.globalAlpha = pa ? s.k : 1; ctx.drawImage(pb, r.x, r.y, r.w, r.h); ctx.globalAlpha = 1; }
      } catch (e) { ctx.globalAlpha = 1; (globalThis.gameErrors = globalThis.gameErrors || []).push('replayArt picture: ' + e.message); }
    }
    ctx.restore();
  };

  // the people who made the play: a ring where they stood on the picture and their name
  const heroes = (film, s, r) => {
    const clip = film.clip, names = new Set(clip.who || []);
    const tm = clip.tm, pulse = Math.abs(film.u - tm) < 0.6;
    const key = Math.floor(film.u * 8);
    clip.palette.forEach((p, idx) => {
      if (!names.has(p.name)) return;
      const qa = (s.a.P || []).find((q) => q[0] === idx), qb = (s.b.P || []).find((q) => q[0] === idx);
      const q = qa && qb ? [idx, lerp(qa[1], qb[1], s.k), lerp(qa[2], qb[2], s.k)] : qa || qb;
      if (!q || !(q[1] > 0.03 && q[1] < 0.97 && q[2] > 0.06 && q[2] < 0.94)) return; // (off the picture: the caption names them)
      const sx = r.x + q[1] * r.w, sy = r.y + q[2] * r.h;
      if (pulse) { ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(sx, sy, 34 + 22 * (key % 4), 0, TAU); ctx.stroke(); } // (rings that jump out on the 8 fps key)
      const ref = (clip.crew || []).find((c) => c.name === p.name) || { name: p.name, color: p.color };
      const hy = sy - 74; // his own head in a gold ring above him, with a pointer down to where he stands
      const inside = hy - 36 > r.y + 10;
      const cy = inside ? hy : sy + 74;
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(sx, sy, 30, 0, TAU); ctx.stroke(); // the ring round him
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(sx, inside ? sy - 32 : sy + 32); ctx.lineTo(sx, inside ? cy + 30 : cy - 30); ctx.stroke();
      logArt.head(ref, sx, cy, 30);
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(sx, cy, 34, 0, TAU); ctx.stroke();
      ctx.font = `700 24px ${F.TEXT}`;
      ctx.textAlign = 'center';
      const nx = clamp(sx, r.x + 70, r.x + r.w - 70), ny = clamp(inside ? cy - 44 : cy + 62, r.y + 30, r.y + r.h - 20);
      ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = INK(); ctx.strokeText(p.name, nx, ny);
      ctx.fillStyle = p.color; ctx.fillText(p.name, nx, ny);
    });
  };

  const tags = (film, r) => {
    const clip = film.clip, sp = speedAt(clip, film.u), X = r.x, Y = r.y, W = r.w;
    ctx.font = `700 24px ${F.TEXT}`;
    ctx.textAlign = 'left';
    const tag = `SLOW MOTION  x${sp.toFixed(1)}`;
    ctx.fillStyle = 'rgba(43,34,22,0.82)'; ctx.beginPath(); ctx.roundRect(X + 14, Y + 14, ctx.measureText(tag).width + 36, 42, 12); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.fillText(tag, X + 32, Y + 43);
    ctx.fillStyle = 'rgba(43,34,22,0.82)'; ctx.beginPath(); ctx.roundRect(X + W - 174, Y + 14, 160, 42, 12); ctx.fill();
    if (Math.floor(film.u * 2) % 2 === 0) { ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.arc(X + W - 150, Y + 35, 9, 0, TAU); ctx.fill(); } // (a recording light that blinks on the half second)
    ctx.fillStyle = '#f3ead6'; ctx.fillText('REPLAY', X + W - 132, Y + 43);
  };

  const draw = (film, opts = {}) => safe(() => {
    const clip = film.clip, s = sampleClip(clip, film.u), r = fit(clip, s.a);
    ctx.fillStyle = 'rgba(43,34,22,.7)';
    ctx.fillRect(-config.W, -config.H, config.W * 3, config.H * 3);
    book.paper(80, 56, 1440, 788, { r: 22 });
    ctx.textAlign = 'center';
    if (opts.shipName) { ctx.font = `700 22px ${F.TEXT}`; ctx.fillStyle = LB.INK_SOFT; ctx.fillText(String(opts.shipName).toUpperCase(), 800, 98, 900); }
    ctx.font = `49px ${F.DISPLAY}`;
    ctx.fillStyle = LB.STAMP;
    ctx.fillText('THE REPLAY', 800, 150);
    strip(r);
    picture(film, s, r);
    ctx.strokeStyle = INK(); ctx.lineWidth = 4; ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 6); ctx.stroke();
    heroes(film, s, r);
    tags(film, r);
    const py = A.Y + A.H + 12; // the film strip under the picture: how far the clip has played
    ctx.fillStyle = 'rgba(107,74,50,0.25)'; ctx.fillRect(r.x, py, r.w, 8);
    ctx.fillStyle = LB.STAMP; ctx.fillRect(r.x, py, r.w * clamp(film.u / Math.max(0.1, clip.len), 0, 1), 8);
    if (opts.play) logArt.playRibbon(opts.play, 800, py + 18, 1120);
    ctx.textAlign = 'center';
    ctx.font = `700 ${A.MIN_PX}px ${F.TEXT}`;
    ctx.fillStyle = LB.INK_SOFT;
    ctx.fillText(A.HINT, 800, 826);
  });

  return { draw, fit };
}
