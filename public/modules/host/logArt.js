// THE SHIP'S BOOK on the TV (SHIPS_BOOK.md L1): the Log line at the top of the sky-dock (with a quill flourish), the PLAY OF THE MISSION ribbon on the scorecard, and the run-end POSTCARD - a cream-paper
// logbook page with the route hand-inked through the stops (a stamp for each), the 6 to 10 lines of the Log, the awards and VICTORY or SHIP LOST stamped across it. Logbook style (cream paper, brown ink,
// red stamps), flat colours, no random numbers. Text is at least config.LOG.ART.MIN_PX logical px (the canvas is 1600 x 900: 22 px here is 26 px on a 1080p TV, readable from 3 m). Never throws.
//   const art = createLogArt({ ctx, book, crewAt })      crewAt(player, x, y, scale, time) = render.js drawCrewAt: a crewman standing at a point (for the head beside the play of the mission)
//   art.dockStrip(entry, y, { maxLines, x, w })   the Log line of the stop just finished (an entry of run.log); returns the y of the strip's bottom
//   art.playRibbon(play, cx, y, w)                "PLAY OF THE MISSION: Mia planted the charge" with the player's head
//   art.postcard(runEnd, secondsLeft)             the whole run-end page
import { config } from '../../config.js';
import { lairOf } from './voyage.js';
import { prettyDate } from './book.js';

const hash = (n) => { let h = Math.imul(n + 1, 2654435761) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; }; // (0..1, the same for the same number: a hand-drawn wobble that does not move)
const TAU = Math.PI * 2;

export function createLogArt({ ctx, book, crewAt }) {
  const LB = config.LOGBOOK, A = config.LOG.ART, F = config.FONTS;
  const emoji = (px) => `${px}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
  // Everything here draws between a save and a restore (the screens around it keep their own text alignment, font and colours).
  const safe = (fn) => {
    ctx.save();
    try { fn(); } catch (e) { (globalThis.gameErrors = globalThis.gameErrors || []).push('logArt: ' + e.message); }
    try { ctx.restore(); } catch (e2) { /* ignore */ }
  };

  // ---- words ----
  // Greedy wrap at width w with the font already set on ctx.
  const wrap = (text, w) => {
    const lines = [];
    let line = '';
    for (const word of String(text).split(' ')) {
      if (line && ctx.measureText(line + ' ' + word).width > w) { lines.push(line); line = word; } else line = line ? line + ' ' + word : word;
    }
    if (line) lines.push(line);
    return lines;
  };
  // Cut a text to `lines` lines at width w, the last one ending in "..." when there is more.
  const clampLines = (text, w, lines) => {
    const all = wrap(text, w);
    if (all.length <= lines) return all;
    const out = all.slice(0, lines);
    let last = out[lines - 1];
    while (last.length > 3 && ctx.measureText(last + '...').width > w) last = last.slice(0, -1).trimEnd();
    out[lines - 1] = last + '...';
    return out;
  };
  // Text with the crew's names picked out in their own colours (bold, with an ink edge, like the award rows): flow-laid in lines of at most w px. colors: name -> colour. Returns the lines of tokens.
  const rich = (text, colors, w, px, weight = 400) => {
    const names = Object.keys(colors || {}).filter(Boolean).sort((a, b) => b.length - a.length);
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = names.length ? String(text).split(new RegExp('(' + names.map(esc).join('|') + ')', 'g')) : [String(text)];
    const toks = [];
    for (const part of parts) {
      if (!part) continue;
      const isName = Object.prototype.hasOwnProperty.call(colors || {}, part);
      if (isName) toks.push({ t: part, name: true, c: colors[part], sp: false });
      else for (const m of part.matchAll(/(\s*)(\S+)(\s*)/g)) toks.push({ t: m[2], name: false, sp: m[1].length > 0, after: m[3].length > 0 });
    }
    const wid = (k) => { ctx.font = k.name ? `700 ${px}px ${F.TEXT}` : `${weight} ${px}px ${F.TEXT}`; return ctx.measureText(k.t).width; };
    ctx.font = `${weight} ${px}px ${F.TEXT}`;
    const space = ctx.measureText(' ').width;
    const lines = [[]];
    let x = 0;
    toks.forEach((k, i) => {
      const prev = toks[i - 1];
      const gap = !prev ? 0 : k.name ? (prev.after ? space : 0) : k.sp || prev.after ? space : 0; // (a space where the text had one: a name sits against a comma or an 's)
      const kw = wid(k);
      if (x > 0 && x + gap + kw > w) { lines.push([]); x = 0; }
      const at = x > 0 ? x + gap : 0;
      lines[lines.length - 1].push({ ...k, x: at, w: kw });
      x = at + kw;
    });
    return lines;
  };
  const drawRichLine = (line, x, y, px, weight = 400, ink = LB.INK) => {
    ctx.textAlign = 'left';
    for (const k of line) {
      if (k.name) {
        ctx.font = `700 ${px}px ${F.TEXT}`;
        ctx.lineJoin = 'round';
        ctx.lineWidth = 4;
        ctx.strokeStyle = LB.INK;
        ctx.strokeText(k.t, x + k.x, y);
        ctx.fillStyle = k.c || ink;
      } else { ctx.font = `${weight} ${px}px ${F.TEXT}`; ctx.fillStyle = ink; }
      ctx.fillText(k.t, x + k.x, y);
    }
  };

  // ---- small drawings ----
  // A goose quill with a drop of ink under its nib; (x, y) is the nib, s the scale (1 = about 80 px tall).
  const quill = (x, y, s = 1) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath(); // the vane
    ctx.moveTo(8, -10);
    ctx.bezierCurveTo(10, -52, 40, -88, 76, -96);
    ctx.bezierCurveTo(74, -62, 54, -26, 22, -4);
    ctx.closePath();
    ctx.fillStyle = '#fffaf0';
    ctx.fill();
    ctx.strokeStyle = LB.INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.lineWidth = 1.2; // barbs
    ctx.strokeStyle = LB.INK_SOFT;
    ctx.beginPath();
    for (let k = 1; k <= 4; k++) { const t = k / 5, px = 8 + 56 * t, py = -10 - 76 * t; ctx.moveTo(px - 2, py + 4); ctx.lineTo(px + 14 - k, py - 14 + k * 2); }
    ctx.stroke();
    ctx.beginPath(); // the shaft
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(26, -44, 76, -96);
    ctx.lineWidth = 2.8;
    ctx.strokeStyle = LB.INK;
    ctx.stroke();
    ctx.fillStyle = LB.INK; // the nib and the drop
    ctx.beginPath(); ctx.moveTo(-2, 2); ctx.lineTo(6, -6); ctx.lineTo(10, -2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(-9, 9, 3, 0, TAU); ctx.fill();
    ctx.restore();
  };
  // A pen swash with a loop in it, from (x, y) across w px.
  const flourish = (x, y, w) => {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = LB.INK_SOFT;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x, y + 2);
    ctx.bezierCurveTo(x + w * 0.2, y + 10, x + w * 0.3, y - 8, x + w * 0.45, y);
    ctx.bezierCurveTo(x + w * 0.5, y - 14, x + w * 0.58, y - 14, x + w * 0.56, y - 4);
    ctx.bezierCurveTo(x + w * 0.54, y + 6, x + w * 0.6, y + 6, x + w * 0.7, y);
    ctx.bezierCurveTo(x + w * 0.82, y - 6, x + w * 0.92, y + 6, x + w, y);
    ctx.stroke();
    ctx.restore();
  };
  // A crewman's head (his species' portrait when the art is loaded), else a disc in his colour. (cx, cy) the centre, r the radius.
  const head = (ref, cx, cy, r) => {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU);
    ctx.fillStyle = '#ead9b4';
    ctx.fill();
    if (crewAt && ref && ref.species) { // the crewman himself, as on the ship (render.js drawCrewAt), his head in the disc
      ctx.clip();
      const sc = (r / 26) * 0.9;
      try { crewAt({ species: ref.species, color: ref.color, name: ref.name }, cx, cy + 62 * sc, sc, 0); } catch (e) { /* the disc stays */ }
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU);
    ctx.strokeStyle = LB.INK;
    ctx.lineWidth = 3;
    ctx.stroke();
  };

  // ---- the sky-dock's Log line ----
  // The strip across the top of the dock: the quill, the stop's head in display type and what happened. y = its top; opts.maxLines (default 3), opts.x / opts.w (default 150 / 1300). Returns the bottom y.
  const dockStrip = (entry, y, opts = {}) => {
    if (!entry || !entry.text) return y;
    const x = opts.x ?? 150, w = opts.w ?? 1300, px = opts.px ?? A.DOCK_PX, maxLines = opts.maxLines ?? 3, lh = Math.round(px * 1.3);
    let bottom = y;
    safe(() => {
      const inner = w - 130;
      const lines = rich(entry.text, entry.colors, inner, px);
      const shown = lines.slice(0, maxLines);
      if (lines.length > maxLines) { // too long for the strip: drop the tail and say so
        const last = shown[maxLines - 1];
        while (last.length > 1 && last.reduce((a, k) => Math.max(a, k.x + k.w), 0) > inner - 30) last.pop();
        last.push({ t: '...', name: false, x: last.length ? last[last.length - 1].x + last[last.length - 1].w + 4 : 0, w: 20 });
      }
      const h = 20 + shown.length * lh;
      book.paper(x, y, w, h, { r: 14 });
      quill(x + 30, y + h - 16, Math.min(0.7, (h - 22) / 100));
      flourish(x + 18, y + h - 7, 74);
      shown.forEach((line, i) => drawRichLine(line, x + 104, y + 14 + px + i * lh, px));
      ctx.textAlign = 'left';
      bottom = y + h;
    });
    return bottom;
  };

  // ---- the scorecard's PLAY OF THE MISSION ----
  const playRibbon = (play, cx, y, w = 1000) => {
    if (!play || !play.text) return;
    safe(() => {
      const px = A.PLAY_PX, h = 78;
      book.paper(cx - w / 2, y, w, h, { r: 16, fill: '#f7e8b4' });
      const crew = (play.crew || [])[0];
      head(crew, cx - w / 2 + 52, y + h / 2, 26);
      ctx.textAlign = 'left';
      ctx.fillStyle = LB.STAMP;
      ctx.font = `700 ${A.MIN_PX}px ${F.TEXT}`;
      ctx.fillText('PLAY OF THE MISSION', cx - w / 2 + 96, y + 28);
      const colors = {};
      for (const c of play.crew || []) colors[c.name] = c.color;
      let size = px, line = [];
      for (;;) { // one line: smaller type until the whole play fits (never under MIN_PX)
        line = rich(play.text, colors, 99999, size)[0] || [];
        if (size <= A.MIN_PX || line.reduce((a, k) => Math.max(a, k.x + k.w), 0) <= w - 130) break;
        size -= 2;
      }
      drawRichLine(line, cx - w / 2 + 96, y + 64, size);
    });
  };

  // ---- the run-end postcard ----
  const STAMP_GREEN = '#3f7a3c';
  // One stop of the route: a round ink stamp with the sky's picture in it (a skull and the creature for a lair, beaten or not), the stop's number, and its name.
  const stopStamp = (r, x, y, i, last, victory, labelAbove, labelW) => {
    const tilt = (hash(i * 7 + 3) - 0.5) * 0.3, R = 33, lost = last && !victory;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU);
    ctx.fillStyle = '#f8f0dc';
    ctx.fill();
    const col = r.flagship ? '#b8892a' : lost ? LB.STAMP : r.lair ? '#7a3a5a' : LB.STAMP;
    ctx.strokeStyle = col; ctx.lineWidth = 3.6; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R - 6, 0, TAU); ctx.lineWidth = 1.4; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const icon = r.flagship ? '\u{1F6A9}' : r.lair && r.creature ? lairOf(r.creature).ICON : r.icon || '\u{2601}\u{FE0F}';
    ctx.font = emoji(34);
    ctx.fillStyle = LB.INK;
    ctx.fillText(icon, 0, 3);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
    if (r.lair) { // the skull of a lair; beaten, a red tick under it
      ctx.font = emoji(26); ctx.textAlign = 'center';
      ctx.fillText('\u{1F480}', x + R - 4, y - R + 12);
      if (r.end === 'done') { ctx.strokeStyle = STAMP_GREEN; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 20, y + 6); ctx.lineTo(x - 7, y + 22); ctx.lineTo(x + 24, y - 20); ctx.stroke(); }
    }
    if (lost) { ctx.strokeStyle = LB.STAMP; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 26, y - 26); ctx.lineTo(x + 26, y + 26); ctx.moveTo(x + 26, y - 26); ctx.lineTo(x - 26, y + 26); ctx.stroke(); }
    else if (r.end === 'limp') { ctx.font = emoji(22); ctx.fillText('\u{1FA79}', x - R + 6, y + R - 6); }
    // the label
    ctx.fillStyle = LB.INK;
    ctx.font = `${A.MIN_PX}px ${F.DISPLAY}`;
    ctx.textAlign = 'center';
    const maxW = labelW;
    const name = r.lair && r.creature ? lairOf(r.creature).NAME.replace(/^The /, '') : r.name;
    const lines = clampLines(name, maxW, 2);
    const total = lines.length;
    lines.forEach((t, k) => ctx.fillText(t, x, labelAbove ? y - R - 14 - (total - 1 - k) * 25 : y + R + 26 + k * 25));
  };

  // opts (L2, bookArt.js): footer = the line at the bottom right in place of "A new voyage starts..." (a page of the Ship's Book); noDim = the dimming is already drawn.
  const postcard = (e, left, opts = {}) => {
    safe(() => {
      const MIN = A.MIN_PX, PX = A.LINE_PX;
      if (!opts.noDim) {
        ctx.fillStyle = 'rgba(43,34,22,.82)';
        ctx.fillRect(-config.W, -config.H, config.W * 3, config.H * 3);
      }
      book.paper(60, 30, 1420, 840, { r: 22 }); // (it ends at x 1480: the join-code badge in the corner of the screen stays clear of it)
      ctx.lineJoin = 'round';
      if (e.shipName && !e.victory) { // (L2: a ship that was lost: the page has a black border)
        ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 9; ctx.strokeRect(67, 37, 1406, 826); // (a heavy mourning border at the paper's edge, and a thin rule inside it: the writing keeps clear of both)
        ctx.lineWidth = 2.5; ctx.strokeRect(78, 48, 1384, 814 - 2);
      }
      // the big rubber stamp across the page, under the writing
      const word = e.victory ? 'VICTORY' : 'SHIP LOST', scol = e.victory ? STAMP_GREEN : LB.STAMP;
      ctx.save();
      ctx.translate(770, 545);
      ctx.rotate(-0.17);
      ctx.globalAlpha = 0.26;
      ctx.font = `150px ${F.DISPLAY}`;
      const bw = ctx.measureText(word).width + 90;
      ctx.strokeStyle = scol; ctx.fillStyle = scol; ctx.lineWidth = 9;
      ctx.strokeRect(-bw / 2, -110, bw, 190);
      ctx.lineWidth = 3;
      ctx.strokeRect(-bw / 2 + 14, -96, bw - 28, 162);
      ctx.textAlign = 'center';
      ctx.fillText(word, 0, 45);
      ctx.restore();
      // the heading
      ctx.textAlign = 'left';
      ctx.fillStyle = LB.INK;
      ctx.font = `50px ${F.DISPLAY}`;
      ctx.fillText(e.shipName ? 'THE LOG OF ' + String(e.shipName).toUpperCase() : "THE SHIP'S LOG", 110, 98, 960); // (L2: her name once she has one)
      ctx.fillStyle = LB.INK_SOFT;
      ctx.font = `700 ${MIN}px ${F.TEXT}`;
      const sub = `${e.modeLabel}${e.voyages > 1 ? ' - voyage ' + e.voyageNo + ' of ' + e.voyages : ''}${e.daily ? ' - DAILY: ' + e.daily + (e.dailyBest ? ' (NEW BEST!)' : '') : ''}${e.date ? ' - ' + prettyDate(e.date) : ''}  -  ${e.victory ? 'all ' + e.done + ' stops flown' : e.done + ' of ' + e.total + ' stops flown'}`;
      ctx.fillText(sub, 112, 133, 1000);
      ctx.textAlign = 'center';
      book.stamp(e.victory ? 'VICTORY!' : 'SHIP LOST!', 1210, 92, { size: 46, rot: -0.05, color: scol });
      ctx.textAlign = 'left';

      // the route, hand-inked through the stops
      const route = e.route || [];
      const n = route.length, x0 = 160, x1 = 1380, cy = 236;
      const xs = route.map((_, i) => (n === 1 ? 770 : x0 + ((x1 - x0) * i) / (n - 1)));
      const ys = route.map((_, i) => cy + 24 * Math.sin(i * 1.7 + 0.6) + (hash(i + 11) - 0.5) * 16);
      if (n) {
        const step = n > 1 ? (x1 - x0) / (n - 1) : 400;
        const alt = n > 8; // many stops: the names take turns above and below the line
        const lw = Math.max(110, Math.min(220, alt ? step * 1.9 : step * 0.95));
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(95, cy + 28); // from the mooring mast
        ctx.lineTo(xs[0] - 40, ys[0]);
        for (let i = 0; i < n - 1; i++) {
          const mx = (xs[i] + xs[i + 1]) / 2, my = (ys[i] + ys[i + 1]) / 2 + (hash(i * 5 + 2) - 0.5) * 34;
          ctx.lineTo(xs[i] + 36, ys[i]);
          ctx.quadraticCurveTo(mx, my, xs[i + 1] - 36, ys[i + 1]);
        }
        ctx.setLineDash([16, 10]);
        ctx.strokeStyle = 'rgba(58,44,32,0.35)'; ctx.lineWidth = 7; ctx.stroke(); // the pen's soft edge
        ctx.strokeStyle = LB.INK; ctx.lineWidth = 3.2; ctx.stroke(); // ...and the line
        ctx.setLineDash([]);
        ctx.restore();
        ctx.font = emoji(30); ctx.textAlign = 'center'; ctx.fillStyle = LB.INK;
        ctx.fillText('⚓', 95, cy + 52); // the mast she cast off from
        route.forEach((r, i) => stopStamp(r, xs[i], ys[i], i, i === n - 1, e.victory, alt && i % 2 === 1, lw));
        ctx.textAlign = 'left';
        // the stop numbers, small, on the line
        ctx.font = `700 ${MIN}px ${F.TEXT}`; ctx.fillStyle = LB.INK_SOFT; ctx.textAlign = 'center';
        route.forEach((r, i) => { if (n <= 12) ctx.fillText(String(r.no), xs[i] - 38, ys[i] - 30); });
        ctx.textAlign = 'left';
      }
      // a rule with a small flourish
      ctx.strokeStyle = LB.INK_SOFT; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(110, 352); ctx.lineTo(1430, 352); ctx.stroke();
      flourish(690, 352, 160);

      // the Log
      const lines = e.lines || [];
      const colors = e.colors || {};
      const textX = 170, textW = 1250, top = 392, bottom = 706;
      let px = PX, lh = 35;
      const layout = () => lines.map((l) => rich(l.text, colors, textW, px));
      let laid = layout();
      const gap = (i) => 4 + (lines[i + 1] && lines[i + 1].no !== lines[i].no ? 8 : 0); // (a little more room between one stop's lines and the next's)
      const sum = () => laid.reduce((a, ls, i) => a + ls.length * lh + gap(i), 0);
      let total = sum();
      while (total > bottom - top && lh > 28) { lh -= 2; total = sum(); }
      while (total > bottom - top && px > MIN) { px -= 1; laid = layout(); total = sum(); }
      let y = top;
      lines.forEach((l, i) => {
        if (i === 0 || lines[i - 1].no !== l.no) { // the stop's number in a little ink circle, where its lines begin
          ctx.beginPath(); ctx.arc(135, y - 8, 20, 0, TAU);
          ctx.fillStyle = '#f8f0dc'; ctx.fill();
          ctx.strokeStyle = LB.STAMP; ctx.lineWidth = 2.6; ctx.stroke();
          ctx.fillStyle = LB.STAMP; ctx.font = `${MIN}px ${F.DISPLAY}`; ctx.textAlign = 'center';
          ctx.fillText(String(l.no), 135, y - 0.5);
          ctx.textAlign = 'left';
        }
        laid[i].forEach((ln, k) => drawRichLine(ln, textX, y + k * lh, px));
        y += laid[i].length * lh + gap(i);
      });
      if (!lines.length) { ctx.fillStyle = LB.INK_SOFT; ctx.font = `${PX}px ${F.TEXT}`; ctx.fillText('The pages are blank - the next voyage will fill them.', textX, top); }

      // the awards, two by two
      ctx.strokeStyle = LB.INK_SOFT; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(110, 718); ctx.lineTo(1430, 718); ctx.stroke();
      (e.rows || []).slice(0, config.LOG.POSTCARD_AWARDS).forEach((r, i) => {
        const cx = 120 + (i % 2) * 650, cy2 = 756 + Math.floor(i / 2) * 38;
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.font = emoji(30); ctx.fillStyle = LB.INK;
        ctx.fillText(r.icon, cx, cy2 + 2);
        ctx.font = `${MIN}px ${F.DISPLAY}`;
        ctx.fillText(r.title, cx + 46, cy2);
        const tw = ctx.measureText(r.title + '  ').width;
        const row = rich(`${r.name}`, { [r.name]: r.color }, 400, MIN);
        drawRichLine(row[0] || [], cx + 46 + tw, cy2, MIN);
        const nw = (row[0] || []).reduce((a, k) => Math.max(a, k.x + k.w), 0);
        ctx.font = `400 ${MIN}px ${F.TEXT}`; ctx.fillStyle = LB.INK_SOFT;
        ctx.fillText(`${r.value} ${r.unit}`, cx + 46 + tw + nw + 14, cy2, 650 - 46 - tw - nw - 24);
      });

      // the footer
      ctx.strokeStyle = LB.INK_SOFT; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(110, 816); ctx.lineTo(1430, 816); ctx.stroke();
      ctx.textAlign = 'left'; ctx.fillStyle = LB.INK; ctx.font = `700 ${MIN}px ${F.TEXT}`;
      ctx.fillText(`Salvage ${e.salvage}  -  ${e.kills} shot down  -  ${e.gunships} gunship${e.gunships === 1 ? '' : 's'} sunk`, 112, 852, 700);
      ctx.textAlign = 'right'; ctx.fillStyle = LB.INK_SOFT; ctx.font = `400 ${MIN}px ${F.TEXT}`;
      ctx.fillText(opts.footer || `A new voyage starts at the mast in ${Math.max(1, Math.ceil(left))}...`, 1430, 852, opts.footer ? 760 : 620);
      ctx.textAlign = 'left';
    });
  };

  return { dockStrip, playRibbon, postcard, quill, flourish, head, rich };
}
