// THE SHIP'S BOOK on the TV, part two (SHIPS_BOOK.md L2; logArt.js is part one): the christening vote, the ceremony (a bottle breaks on the bow), the ship's name plate, the lobby's book card and the Ship's Book page
// (a cover, then one postcard for each voyage, newest first). Logbook style (cream paper, brown ink, red stamps), flat colours, NO random numbers and no sine of time: the ceremony runs on 8 pose keys a second.
// Text is at least config.BOOK.ART.MIN_PX logical px (the canvas is 1600 x 900: 22 px here is 26 on a 1080p TV). Never throws.
//   const art = createBookArt({ ctx, book, logArt, dots })
//   art.vote(v, voters)                the name vote over the dimmed stage: five names and "Name her later", a dot for each vote
//   art.ceremony(christen)             the bottle, the plank and her name painted on it (state.christen = { name, t, t0 })
//   art.plate(name, x, y)              the small name plate in the HUD; returns its width
//   art.lobbyCard(save, name, x, y)    "THE SHIP'S BOOK" card in the lobby
//   art.page(view, save)               the Ship's Book (view = { page }): page 0 the cover, then the voyages; returns the number of pages
import { config } from '../../config.js';
import { prettyDate, shipRef } from './book.js';

const TAU = Math.PI * 2;
const hash = (n) => { let h = Math.imul(n + 1, 2654435761) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; }; // (0..1, the same for the same number)
const STAMP_GREEN = '#3f7a3c';

export function createBookArt({ ctx, book, logArt, dots }) {
  const LB = config.LOGBOOK, F = config.FONTS, A = config.BOOK.ART, C = config.BOOK.CHRISTEN;
  const MIN = A.MIN_PX;
  const emoji = (px) => `${px}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
  const safe = (fn) => {
    ctx.save();
    try { fn(); } catch (e) { (globalThis.gameErrors = globalThis.gameErrors || []).push('bookArt: ' + e.message); }
    try { ctx.restore(); } catch (e2) { /* ignore */ }
  };
  const upper = (s) => String(s || '').toUpperCase();
  // Display type at the largest size (from `px` down to `min`) that fits w; returns the size used.
  const fit = (text, w, px, min = MIN) => {
    let size = px;
    for (;;) { ctx.font = `${size}px ${F.DISPLAY}`; if (size <= min || ctx.measureText(text).width <= w) return size; size -= 2; }
  };
  // Two lines at most, at display size `px` shrinking to `min` (a long name is cut at a space).
  const twoLines = (text, w, px, min) => {
    let size = px;
    for (;;) {
      ctx.font = `${size}px ${F.DISPLAY}`;
      const words = text.split(' ');
      let a = '', b = '';
      for (const word of words) { if (!b && ctx.measureText((a ? a + ' ' : '') + word).width <= w) a = a ? a + ' ' + word : word; else b = b ? b + ' ' + word : word; }
      if ((!b || ctx.measureText(b).width <= w) && ctx.measureText(a).width <= w) return { size, lines: b ? [a, b] : [a] };
      if (size <= min) return { size, lines: b ? [a, b] : [a] };
      size -= 2;
    }
  };

  // ---- the name vote ----
  const vote = (v, voters) => safe(() => {
    ctx.fillStyle = 'rgba(43,34,22,.85)'; // (the lobby behind it steps back: the vote has the whole stage)
    ctx.fillRect(-config.W, -config.H, config.W * 3, config.H * 3);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f3ead6';
    ctx.font = `56px ${F.DISPLAY}`;
    ctx.fillText('NAME THE SHIP!', 800, 112, 1000);
    ctx.fillStyle = '#ffd23f';
    ctx.font = `700 ${MIN + 2}px ${F.TEXT}`;
    ctx.fillText(`Vote on your phone - ${Math.max(0, Math.ceil(v.t))}s   -   or press SPACE to skip`, 800, 156, 1300);
    const n = v.options.length, cols = 3, cw = 440, ch = 252, gap = 24;
    const x0 = 800 - (cols * cw + (cols - 1) * gap) / 2, y0 = 196;
    v.options.forEach((o, i) => {
      const x = x0 + (i % cols) * (cw + gap), y = y0 + Math.floor(i / cols) * (ch + gap);
      const skip = o.kind === 'skip';
      book.paper(x, y, cw, ch, { r: 16, fill: skip ? '#d6e3bc' : null });
      ctx.fillStyle = LB.INK;
      ctx.textAlign = 'center';
      ctx.font = emoji(56);
      ctx.fillText(o.icon, x + cw / 2, y + 78);
      const t = twoLines(upper(o.name), cw - 44, skip ? 32 : 40, 28);
      ctx.font = `${t.size}px ${F.DISPLAY}`;
      ctx.fillStyle = skip ? LB.INK_SOFT : LB.INK;
      t.lines.forEach((l, k) => ctx.fillText(l, x + cw / 2, y + 132 + k * (t.size + 6)));
      if (skip) { ctx.font = `400 ${MIN}px ${F.TEXT}`; ctx.fillStyle = LB.INK_SOFT; ctx.fillText(o.desc, x + cw / 2, y + 200); }
      dots(voters.filter((p) => p.vote === i), x + cw / 2, y + ch - 20);
    });
    ctx.fillStyle = '#f3ead6';
    ctx.font = `400 ${MIN}px ${F.TEXT}`;
    ctx.fillText('Her name goes in the Log, on the postcard and on the ship\'s plate.', 800, y0 + 2 * (ch + gap) + 34, 1300);
  });

  // ---- the ceremony ----
  const FPS = 8; // pose keys a second: held, then snapped (no easing of time)
  const PALETTE = ['#a8443f', '#c9a85a', '#3f7a3c', '#4d7fb3', '#f3ead6'];
  // The bottle in its own space: the neck at (0, 0), the body along +y; broken = only the jagged neck.
  const bottle = (broken) => {
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = LB.INK;
    ctx.fillStyle = '#3f8a52';
    ctx.beginPath();
    if (broken) { ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.lineTo(10, 40); ctx.lineTo(4, 46); ctx.lineTo(0, 38); ctx.lineTo(-5, 48); ctx.lineTo(-10, 40); ctx.closePath(); }
    else { ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.lineTo(10, 46); ctx.bezierCurveTo(34, 66, 34, 96, 33, 150); ctx.lineTo(-33, 150); ctx.bezierCurveTo(-34, 96, -34, 66, -10, 46); ctx.closePath(); }
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c9a85a'; // the foil on the neck
    ctx.fillRect(-10, -2, 20, 22);
    ctx.strokeRect(-10, -2, 20, 22);
    if (!broken) {
      ctx.fillStyle = '#f3ead6'; // the label
      ctx.fillRect(-26, 84, 52, 40);
      ctx.strokeRect(-26, 84, 52, 40);
      ctx.fillStyle = LB.STAMP;
      ctx.beginPath(); ctx.arc(0, 104, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.4)'; // a highlight
      ctx.fillRect(-24, 70, 7, 60);
    }
  };
  const ceremony = (c) => safe(() => {
    const e = Math.max(0, c.t0 - c.t), key = Math.floor(e * FPS), brk = Math.round(C.BREAK_AT * FPS), name = upper(c.name);
    const broke = key >= brk, since = key - brk;
    ctx.fillStyle = 'rgba(43,34,22,.9)';
    ctx.fillRect(-config.W, -config.H, config.W * 3, config.H * 3);
    // bunting across the top
    ctx.lineWidth = 3; ctx.strokeStyle = LB.INK; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(40, 40); ctx.quadraticCurveTo(800, 120, 1560, 40); ctx.stroke();
    for (let k = 0; k < 17; k++) {
      const u = (k + 0.5) / 17, x = 40 + 1520 * u, y = 40 + 80 * 2 * u * (1 - u) + 2;
      ctx.fillStyle = PALETTE[k % 4];
      ctx.beginPath(); ctx.moveTo(x - 20, y); ctx.lineTo(x + 20, y); ctx.lineTo(x, y + 44); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f3ead6';
    ctx.font = `50px ${F.DISPLAY}`;
    ctx.fillText('WE NAME THIS SHIP', 800, 196, 1200);
    // the bow plank: wood, three boards, rivets
    const px = 260, py = 250, pw = 1040, ph = 330;
    ctx.fillStyle = '#a9733f'; ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = 'rgba(58,44,32,.22)';
    for (let k = 1; k < 3; k++) ctx.fillRect(px, py + (ph / 3) * k - 3, pw, 6);
    ctx.fillStyle = '#c9a85a';
    for (let k = 0; k < 3; k++) for (let j = 0; j < 14; j++) { ctx.beginPath(); ctx.arc(px + 36 + j * ((pw - 72) / 13), py + 18 + k * (ph / 3), 5, 0, TAU); ctx.fill(); }
    ctx.lineWidth = 6; ctx.strokeStyle = LB.INK; ctx.strokeRect(px, py, pw, ph);
    // her name, painted a letter at a time once the glass has gone
    const shown = broke ? Math.max(0, Math.min(name.length, Math.floor((e - C.BREAK_AT - 0.5) * 14))) : 0;
    const size = fit(name, pw - 90, 96, 40);
    ctx.font = `${size}px ${F.DISPLAY}`;
    const full = ctx.measureText(name).width;
    ctx.textAlign = 'left';
    ctx.lineWidth = 8; ctx.strokeStyle = LB.INK; ctx.fillStyle = '#f3ead6';
    const part = name.slice(0, shown);
    ctx.strokeText(part, 800 - full / 2, py + ph / 2 + size * 0.34);
    ctx.fillText(part, 800 - full / 2, py + ph / 2 + size * 0.34);
    ctx.textAlign = 'center';
    // the bottle: a stepped swing in from the right on its rope, then the break
    const rope = { x: 1580, y: -30 }, neck = { x: px + pw + 104, y: py - 50 }; // (the neck end of the rope when it hits; the body trails 150 px beyond it, into the plank)
    const hit = { x: px + pw + 10, y: py + 60 };
    const u = Math.min(1, key / Math.max(1, brk)), s = u * u; // (it falls faster towards the end)
    const bx = 1570 + (neck.x - 1570) * s, by = 20 + (neck.y - 20) * s;
    ctx.strokeStyle = '#6b4a32'; ctx.lineWidth = 5;
    if (!broke) {
      ctx.beginPath(); ctx.moveTo(rope.x, rope.y); ctx.lineTo(bx, by); ctx.stroke();
      ctx.save(); ctx.translate(bx, by); ctx.rotate(Math.atan2(by - rope.y, bx - rope.x) - Math.PI / 2); bottle(false); ctx.restore();
    } else {
      const dropY = neck.y + Math.min(60, since * 8); // (the neck is left hanging on the rope, dropping a step at a time)
      ctx.beginPath(); ctx.moveTo(rope.x, rope.y); ctx.lineTo(neck.x, dropY); ctx.stroke();
      ctx.save(); ctx.translate(neck.x, dropY); ctx.rotate(Math.atan2(dropY - rope.y, neck.x - rope.x) - Math.PI / 2); bottle(true); ctx.restore();
      const t = Math.min(since, 6); // foam and glass fly out from the point of impact for six keys
      for (let k = 0; k < 16; k++) {
        const a = (hash(k * 3) - 0.5) * Math.PI * 1.1, sp = 30 + 70 * hash(k * 3 + 1);
        const x = hit.x + Math.cos(a) * sp * t * 0.5, y = hit.y + Math.sin(a) * sp * t * 0.5 + 4.5 * t * t;
        ctx.fillStyle = k % 3 === 0 ? '#fffaf0' : k % 3 === 1 ? '#7fc796' : '#e8f4ee';
        ctx.beginPath();
        if (k % 3 === 0) ctx.arc(x, y, 10 + 6 * hash(k), 0, TAU);
        else { ctx.moveTo(x, y); ctx.lineTo(x + 12, y + 5); ctx.lineTo(x + 4, y + 14); ctx.closePath(); }
        ctx.fill();
      }
      ctx.fillStyle = '#fffaf0'; // foam running down the plank
      for (let k = 0; k < 5; k++) { const len = Math.min(10 + 40 * hash(k + 40), since * 9), fx = px + pw - 22 - k * 16; ctx.fillRect(fx, hit.y - 20, 9, len); ctx.beginPath(); ctx.arc(fx + 4.5, hit.y - 20 + len, 4.5, 0, TAU); ctx.fill(); }
      if (since === 0) { ctx.fillStyle = 'rgba(255,250,240,.5)'; ctx.fillRect(-config.W, -config.H, config.W * 3, config.H * 3); } // the flash
    }
    // the wish, and confetti for her
    if (broke && shown >= name.length) {
      ctx.fillStyle = '#f3ead6';
      ctx.font = `700 ${MIN + 4}px ${F.TEXT}`;
      ctx.fillText('Fair winds to her, and to all who fly in her.', 800, 650, 1200);
      const ck = key - brk - Math.ceil((name.length / 14 + 0.5) * FPS);
      for (let k = 0; k < 44 && ck > 0; k++) {
        const x = 40 + 1520 * hash(k * 5), y = (hash(k * 5 + 1) * 600 + ck * 34) % 900 - 20;
        ctx.fillStyle = PALETTE[k % PALETTE.length];
        ctx.fillRect(x, y, 14, 9);
      }
    }
    ctx.fillStyle = '#f3ead6';
    ctx.font = `400 ${MIN}px ${F.TEXT}`;
    ctx.textAlign = 'right';
    ctx.fillText('SPACE to skip', 1560, 868);
  });

  // ---- the name plate in the HUD ----
  const plate = (name, x, y) => {
    let w = 0;
    safe(() => {
      ctx.font = `700 ${A.PLATE_PX}px ${F.TEXT}`;
      w = Math.min(440, ctx.measureText(upper(name)).width + 36);
      book.paper(x, y, w, 36, { r: 8, pins: false });
      ctx.fillStyle = LB.INK;
      ctx.textAlign = 'center';
      ctx.fillText(upper(name), x + w / 2, y + 26, w - 24);
    });
    return w;
  };

  // ---- the lobby's card ----
  const lobbyCard = (save, name, x, y) => safe(() => {
    const last = save && save.book && save.book.length ? save.book[save.book.length - 1] : null;
    const s = save && save.ship;
    book.paper(x, y, 440, 214, { r: 14 });
    ctx.textAlign = 'left';
    ctx.fillStyle = LB.INK;
    ctx.font = `28px ${F.DISPLAY}`;
    ctx.fillText("THE SHIP'S BOOK", x + 26, y + 46, 390);
    ctx.font = `700 ${MIN + 2}px ${F.TEXT}`;
    ctx.fillText(name ? upper(name) : 'Not christened yet', x + 26, y + 84, 390);
    ctx.font = `400 ${MIN}px ${F.TEXT}`;
    ctx.fillStyle = LB.INK_SOFT;
    ctx.fillText(name && s ? `${s.voyages} voyage${s.voyages === 1 ? '' : 's'}, ${s.victories} won` : 'The crew names her at CAST OFF.', x + 26, y + 116, 390);
    ctx.fillText(last ? `Last: ${prettyDate(last.date)}, ${last.victory ? 'VICTORY' : 'ship lost'}` : 'The first page is blank.', x + 26, y + 146, 390);
    ctx.fillStyle = LB.STAMP;
    ctx.font = `700 ${MIN}px ${F.TEXT}`;
    ctx.fillText('Press B to read the book', x + 26, y + 190, 390);
  });

  // ---- the Ship's Book page ----
  // Newest first: page 1 is the last voyage.
  const entryAt = (save, page) => save.book[save.book.length - page];
  const cover = (save, pages) => {
    const s = save.ship, X = 110;
    book.paper(60, 30, 1420, 840, { r: 22 });
    ctx.textAlign = 'left';
    ctx.fillStyle = LB.INK;
    ctx.font = `56px ${F.DISPLAY}`;
    ctx.fillText("THE SHIP'S BOOK", X, 108, 900);
    ctx.fillStyle = LB.INK_SOFT;
    ctx.font = `700 ${MIN + 2}px ${F.TEXT}`;
    ctx.fillText('kept on this TV', X + 2, 146);
    // her
    ctx.fillStyle = LB.INK_SOFT; ctx.font = `700 ${MIN}px ${F.TEXT}`;
    ctx.fillText('THE SHIP', X, 204);
    if (s) {
      ctx.fillStyle = LB.INK;
      fit(upper(s.name), 600, 48, 30);
      ctx.fillText(upper(s.name), X, 258, 600);
      ctx.font = `400 ${MIN + 2}px ${F.TEXT}`; ctx.fillStyle = LB.INK;
      ctx.fillText(`Christened ${prettyDate(s.born) || 'long ago'}`, X, 296, 600);
      ctx.fillText(`${s.voyages} voyage${s.voyages === 1 ? '' : 's'}, ${s.victories} won, ${s.stops} stops flown`, X, 330, 600);
    } else {
      ctx.fillStyle = LB.INK; ctx.font = `400 ${MIN + 2}px ${F.TEXT}`;
      ctx.fillText('She has no name yet.', X, 262, 600);
      ctx.fillText('The crew christens her at the next CAST OFF.', X, 296, 620);
    }
    // the ships she followed
    const K = config.BOOK.COVER;
    const fleet = save.fleet.slice(-K.FLEET).reverse();
    let y = 384;
    if (fleet.length) {
      const h = 52 + fleet.length * 36;
      ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 8; ctx.strokeRect(X - 12, y - 30, 640, h);
      ctx.lineWidth = 2; ctx.strokeRect(X - 4, y - 22, 624, h - 16);
      ctx.fillStyle = '#1b1410'; ctx.font = `700 ${MIN}px ${F.TEXT}`;
      ctx.fillText('IN MEMORIAM', X + 8, y + 2);
      ctx.font = `400 ${MIN}px ${F.TEXT}`;
      fleet.forEach((f, i) => ctx.fillText(`${f.name} - lost${f.where ? ' at ' + f.where : ''}, ${f.voyages} voyage${f.voyages === 1 ? '' : 's'}`, X + 8, y + 40 + i * 36, 606));
      y += h + 30;
    }
    // the crew
    const crew = Object.values(save.crew).sort((a, b) => b.voyages - a.voyages || String(b.last).localeCompare(String(a.last))).slice(0, K.CREW);
    ctx.fillStyle = LB.INK_SOFT; ctx.font = `700 ${MIN}px ${F.TEXT}`;
    ctx.fillText('THE CREW', X, Math.max(y + 30, 566));
    crew.forEach((c, i) => {
      const cy = Math.max(y + 30, 566) + 36 + i * 34;
      ctx.beginPath(); ctx.arc(X + 12, cy - 8, 10, 0, TAU); ctx.fillStyle = c.color; ctx.fill(); ctx.strokeStyle = LB.INK; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = LB.INK; ctx.font = `700 ${MIN}px ${F.TEXT}`;
      ctx.fillText(c.name, X + 34, cy, 230);
      ctx.fillStyle = LB.INK_SOFT; ctx.font = `400 ${MIN}px ${F.TEXT}`;
      ctx.fillText(`${c.voyages} voyage${c.voyages === 1 ? '' : 's'}, ${c.victories} won`, X + 280, cy, 330);
    });
    if (!crew.length) { ctx.fillStyle = LB.INK_SOFT; ctx.font = `400 ${MIN}px ${F.TEXT}`; ctx.fillText('Nobody has signed the book yet.', X, Math.max(y + 30, 566) + 36); }
    // the voyages, newest first
    const RX = 790;
    ctx.fillStyle = LB.INK_SOFT; ctx.font = `700 ${MIN}px ${F.TEXT}`;
    ctx.fillText('RECENT VOYAGES', RX, 204);
    ctx.strokeStyle = LB.INK_SOFT; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(RX, 218); ctx.lineTo(1430, 218); ctx.stroke();
    const rows = Math.min(K.VOYAGES, save.book.length);
    for (let i = 0; i < rows; i++) {
      const e = entryAt(save, i + 1), ry = 262 + i * 100;
      ctx.beginPath(); ctx.arc(RX + 26, ry - 8, 24, 0, TAU); ctx.fillStyle = '#f8f0dc'; ctx.fill(); ctx.strokeStyle = e.victory ? STAMP_GREEN : LB.STAMP; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = e.victory ? STAMP_GREEN : LB.STAMP; ctx.font = `${MIN}px ${F.DISPLAY}`; ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), RX + 26, ry);
      ctx.textAlign = 'left';
      ctx.fillStyle = e.victory ? STAMP_GREEN : LB.STAMP; ctx.font = `700 ${MIN + 4}px ${F.TEXT}`;
      ctx.fillText(`${e.victory ? 'VICTORY' : 'SHIP LOST'}  -  ${prettyDate(e.date) || 'a past evening'}`, RX + 66, ry - 4, 560);
      ctx.fillStyle = LB.INK; ctx.font = `400 ${MIN}px ${F.TEXT}`;
      ctx.fillText(`${e.ship || 'No name'}: ${e.done} of ${e.total} stops, salvage ${e.salvage}`, RX + 66, ry + 28, 560);
    }
    if (!rows) { ctx.fillStyle = LB.INK_SOFT; ctx.font = `400 ${MIN + 2}px ${F.TEXT}`; ctx.fillText('The pages are blank - the first voyage will fill them.', RX, 262, 640); }
    ctx.fillStyle = LB.INK_SOFT; ctx.font = `400 ${MIN}px ${F.TEXT}`;
    ctx.beginPath(); ctx.moveTo(110, 816); ctx.lineTo(1430, 816); ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillText('Left and Right turn the page - Esc closes the book', 112, 852, 800);
    ctx.textAlign = 'right';
    ctx.fillText(`Page 1 of ${pages}`, 1430, 852);
    ctx.textAlign = 'left';
  };
  const page = (view, save) => {
    const pages = 1 + (save && save.book ? save.book.length : 0);
    safe(() => {
      const p = Math.max(0, Math.min(pages - 1, view.page | 0));
      ctx.fillStyle = 'rgba(43,34,22,.82)';
      ctx.fillRect(-config.W, -config.H, config.W * 3, config.H * 3);
      if (p === 0) cover(save, pages);
      else logArt.postcard(entryAt(save, p), 0, { footer: `Page ${p + 1} of ${pages}  -  Left and Right turn the page, Esc closes the book`, noDim: true });
    });
    return pages;
  };

  return { vote, ceremony, plate, lobbyCard, page, shipRef };
}
