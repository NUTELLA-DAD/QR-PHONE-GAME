// THE NEMESIS on the TV (SHIPS_BOOK.md L4; nemesis.js): her portrait BADGE (a round seal in her cloth colour with her emblem and a pip for each level she has grown), the card under the stop's briefing
// ("THE RED KESTREL IS HUNTING YOU"), and the lobby's WANTED card (the captain still out there, and the flags of those who were sunk). Logbook style, flat colours, NO random numbers and no sine of time.
// Text is at least config.BOOK.ART.MIN_PX logical px (the canvas is 1600 x 900). Never throws. Her colours are the ones her ship flies (bp.flag / bp.emblem), so the badge and the gunship match.
//   const art = createNemesisArt({ ctx, book })
//   art.badge(x, y, r, look, level)        the seal (look = { a, b, emblem, badge })
//   art.briefing(b, alpha)                 the card under the briefing card (b = state.briefing.nemesis)
//   art.lobbyCard(save, x, y)              the WANTED card in the lobby; returns its height (0 when the Book knows nobody)
import { config } from '../../config.js';

const TAU = Math.PI * 2;
const DARK = '#2b2118';

// Her emblem in the seal, in trim colour b over cloth a. r = the seal's radius.
function drawEmblem(ctx, kind, x, y, r, b) {
  ctx.fillStyle = b;
  ctx.strokeStyle = b;
  ctx.lineWidth = Math.max(2, r * 0.13);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (kind === 'eye') {
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.55, r * 0.3, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r * 0.17, 0, TAU); ctx.fill();
  } else if (kind === 'band') {
    ctx.fillRect(x - r * 0.62, y - r * 0.14, r * 1.24, r * 0.28);
    ctx.fillRect(x - r * 0.62, y - r * 0.5, r * 1.24, r * 0.1);
    ctx.fillRect(x - r * 0.62, y + r * 0.4, r * 1.24, r * 0.1);
  } else if (kind === 'chevrons') {
    for (const dy of [-0.28, 0.12]) { ctx.beginPath(); ctx.moveTo(x - r * 0.5, y + r * dy); ctx.lineTo(x, y + r * (dy + 0.34)); ctx.lineTo(x + r * 0.5, y + r * dy); ctx.stroke(); }
  } else if (kind === 'fangs') {
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * r * 0.5, y - r * 0.32); ctx.lineTo(x + s * r * 0.22, y - r * 0.32); ctx.lineTo(x + s * r * 0.36, y + r * 0.42); ctx.closePath(); ctx.fill(); }
  } else { // horns
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * r * 0.18, y + r * 0.42); ctx.quadraticCurveTo(x + s * r * 0.62, y + r * 0.3, x + s * r * 0.5, y - r * 0.46); ctx.stroke(); }
  }
}

// The seal. level = pips along the bottom (0 = none).
export function drawBadge(ctx, x, y, r, look, level = 0) {
  try {
    const L = look || {};
    ctx.save();
    ctx.lineWidth = Math.max(2, r * 0.1);
    ctx.fillStyle = L.a || '#8c2f2f';
    ctx.strokeStyle = DARK;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = L.b || '#f2d36b';
    ctx.lineWidth = Math.max(1.5, r * 0.07);
    ctx.beginPath(); ctx.arc(x, y, r * 0.82, 0, TAU); ctx.stroke();
    drawEmblem(ctx, L.emblem, x, y - r * 0.06, r * 0.82, L.b || '#f2d36b');
    ctx.fillStyle = L.b || '#f2d36b';
    for (let i = 0; i < level; i++) { ctx.beginPath(); ctx.arc(x + (i - (level - 1) / 2) * r * 0.2, y + r * 0.66, r * 0.07, 0, TAU); ctx.fill(); }
    ctx.restore();
  } catch (e) { (globalThis.gameErrors = globalThis.gameErrors || []).push('nemesisArt: ' + e.message); }
}

export function createNemesisArt({ ctx, book }) {
  const LB = config.LOGBOOK, F = config.FONTS, MIN = config.BOOK.ART.MIN_PX;
  const safe = (fn) => {
    ctx.save();
    try { fn(); } catch (e) { (globalThis.gameErrors = globalThis.gameErrors || []).push('nemesisArt: ' + e.message); }
    try { ctx.restore(); } catch (e2) { /* ignore */ }
  };
  // Display type at the largest size (from `px` down to `min`) that fits w.
  const fit = (text, w, px, min = MIN) => { let size = px; for (;;) { ctx.font = `${size}px ${F.DISPLAY}`; if (size <= min || ctx.measureText(text).width <= w) return size; size -= 2; } };

  // The card under the briefing: the seal, the headline in her words, what she remembers.
  const briefing = (n, alpha = 1) => safe(() => {
    if (!n) return;
    ctx.globalAlpha = alpha;
    book.paper(300, 462, 1000, 176, { r: 22 });
    drawBadge(ctx, 398, 550, 62, n.look, n.level);
    ctx.textAlign = 'left';
    ctx.fillStyle = LB.INK_SOFT;
    ctx.font = `700 ${MIN}px ${F.TEXT}`;
    ctx.fillText(n.rumour ? 'THE BOOK REMEMBERS' : n.final ? 'THE FINAL SHOWDOWN' : 'THE NEMESIS', 490, 506, 780);
    ctx.fillStyle = n.look && n.look.a ? n.look.a : LB.STAMP;
    const px = fit(n.line, 780, 46, 30);
    ctx.fillText(n.line, 490, 556, 780);
    void px;
    ctx.fillStyle = LB.INK;
    ctx.font = `400 ${MIN}px ${F.TEXT}`;
    ctx.fillText(n.sub, 490, 604, 780);
  });

  // A small pennant for a flag in the book.
  const pennant = (x, y, look) => {
    ctx.fillStyle = (look && look.a) || '#8c2f2f';
    ctx.strokeStyle = DARK; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, y - 22); ctx.lineTo(x + 36, y - 12); ctx.lineTo(x, y - 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - 26); ctx.lineTo(x, y + 14); ctx.stroke();
  };

  // The lobby's card: who is still out there, and the flags of the beaten (a row of small pennants). Returns its height.
  const lobbyCard = (save, x, y) => {
    const N = save && save.nemesis, foe = N && N.cur, flags = (N && N.fallen) || [];
    if (!foe && !flags.length) return 0;
    const h = foe ? (flags.length ? 140 : 108) : 64;
    safe(() => {
      book.paper(x, y, 440, h, { r: 14 });
      ctx.textAlign = 'left';
      let fy = y + 40;
      if (foe) {
        drawBadge(ctx, x + 50, y + 50, 32, foe.look, Math.min(config.NEMESIS.MAX_LEVEL, foe.meets | 0));
        ctx.fillStyle = LB.INK_SOFT; ctx.font = `700 ${MIN}px ${F.TEXT}`;
        ctx.fillText(foe.meets ? 'STILL OUT THERE' : 'WANTED', x + 100, y + 28, 320);
        ctx.fillStyle = foe.look && foe.look.a ? foe.look.a : LB.INK; ctx.font = `28px ${F.DISPLAY}`;
        ctx.fillText(String(foe.name).toUpperCase(), x + 100, y + 58, 320);
        ctx.fillStyle = LB.INK; ctx.font = `400 ${MIN}px ${F.TEXT}`;
        ctx.fillText(foe.meets ? `met ${foe.meets}, driven off ${foe.escapes | 0}` : 'The crew has not met her yet.', x + 100, y + 86, 320);
        fy = y + 124;
      }
      if (flags.length) {
        ctx.fillStyle = LB.INK_SOFT; ctx.font = `700 ${MIN}px ${F.TEXT}`;
        ctx.fillText(`FLAGS WON: ${flags.length}`, x + 22, fy, 200);
        flags.slice(-6).forEach((f, i) => pennant(x + 232 + i * 32, fy + 2, f.look));
      }
    });
    return h;
  };

  return { badge: (x, y, r, look, level) => drawBadge(ctx, x, y, r, look, level), briefing, lobbyCard };
}
