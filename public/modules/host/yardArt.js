// The Shipwright's Yard on the TV (S.6b): the sky-dock screen when a PART card is on offer, the A / B / C vote for where it goes, the BUILT stamp, and the "NEW: ENGINE POD" call-out
// over the new part after cast off. Logbook style (cream paper, brown ink, brass pins, red stamps). Pure drawing: simulation.js owns the votes (state.vote, state.yard).
//   const yard = createYardArt({ ctx, book, dots, wrapLines, ink, pics, spares, world })
//   yard.isYard(vote)            is this vote the Yard's screen (a dock with a part card, or the slot vote)
//   yard.draw(vote, voters)      the whole screen (the dark veil is already down)
//   yard.drawNew(time)           in a SHIP's frame: the call-out over the part that was just built (draws nothing when there is none)
import { config } from '../../config.js';
import { blueprintView, drawBlueprint } from './blueprintArt.js';

const GOOD = '#4f7f3f', WARNC = '#c9892a', BAD = '#a8443f';
const levelColor = (lv) => (lv === 'FAIL' ? BAD : lv === 'WARN' ? WARNC : GOOD);
const BP = { x: 40, y: 140, w: 720, h: 410 }; // the blueprint panel
const GA = { x: 40, y: 562, w: 720, h: 132 }; // the four gauges
const NOTE = { x: 40, y: 706, w: 720, h: 150 }; // what the part is and where it can go
const RIGHT = { x: 790, y: 140, w: 770, h: 716 }; // the shop cards, or the A / B / C cards

export function createYardArt({ ctx, book, dots, wrapLines, ink, pics, spares, world }) {
  const L = config.LOGBOOK;
  const bp = { cv: null, key: '', v: null };

  // The part card a dock vote is about, or null.
  const partOf = (v) => (v.kind === 'slot' ? v.part : v.options.find((o) => o.kind === 'part') || null);
  const isYard = (v) => v.kind === 'slot' || (v.kind === 'dock' && v.options.some((o) => o.kind === 'part'));

  // ---- the blueprint panel: baked to a canvas, redrawn only when the ship, the pins or the stamp change ----
  const blueprint = (layout, pins, stamp) => {
    const k = 2, w = Math.round((BP.w - 16) * k), h = Math.round((BP.h - 16) * k);
    const key = [layout.version, w, h, pins.map((p) => p.letter + p.x + ':' + p.y).join(), stamp ? stamp.text + stamp.sub : ''].join('|');
    if (!bp.cv) bp.cv = document.createElement('canvas');
    if (bp.key !== key) {
      bp.cv.width = w;
      bp.cv.height = h;
      const g = bp.cv.getContext('2d');
      bp.v = blueprintView(layout, w, h, k, true);
      try { drawBlueprint(g, bp.v, layout, { clean: true, pins, stamp }); } catch (e) { (globalThis.gameErrors = globalThis.gameErrors || []).push('yardArt blueprint: ' + e.message); }
      bp.key = key;
    }
    book.paper(BP.x, BP.y, BP.w, BP.h, { r: 14 });
    ctx.drawImage(bp.cv, BP.x + 8, BP.y + 8, BP.w - 16, BP.h - 16);
    ctx.fillStyle = L.INK_SOFT;
    ctx.font = '700 13px ' + config.FONTS.TEXT;
    ctx.textAlign = 'left';
    ctx.fillText('THE BLUEPRINT', BP.x + 18, BP.y + 24);
  };

  // ---- one gauge card: a big number, a line, a bar with its zones, a triangle for the ship as she is and a brass letter for each place ----
  const gauge = (i, title, big, sub, lv, lo, hi, zones, now, afters) => {
    const gap = 10, w = (GA.w - gap * 3) / 4, x = GA.x + i * (w + gap), y = GA.y, h = GA.h;
    book.paper(x, y, w, h, { r: 10, pins: false });
    ctx.textAlign = 'left';
    ctx.fillStyle = L.INK;
    ctx.font = '17px ' + config.FONTS.DISPLAY;
    ctx.fillText(title, x + 12, y + 26);
    ctx.fillStyle = levelColor(lv);
    ctx.font = '22px ' + config.FONTS.DISPLAY;
    ctx.fillText(big, x + 12, y + 54, w - 20);
    ctx.fillStyle = L.INK_SOFT;
    ctx.font = '400 12px ' + config.FONTS.TEXT;
    ctx.fillText(sub, x + 12, y + 72, w - 20);
    const bx = x + 12, bw = w - 24, by = y + h - 40, at = (v) => bx + ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * bw;
    for (const [a, z, c] of zones) { ctx.fillStyle = c; ctx.fillRect(at(a), by, at(z) - at(a), 14); }
    ctx.strokeStyle = L.INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, 14);
    ctx.fillStyle = L.INK; // the ship as she is now
    ctx.beginPath(); ctx.moveTo(at(now), by - 1); ctx.lineTo(at(now) - 6, by - 11); ctx.lineTo(at(now) + 6, by - 11); ctx.closePath(); ctx.fill();
    for (const a of afters) { // ...and with the part at each place
      ctx.beginPath(); ctx.arc(at(a.v), by + 7, 10, 0, 7); ctx.fillStyle = L.PIN; ctx.fill(); ctx.strokeStyle = L.INK; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = L.INK; ctx.font = '14px ' + config.FONTS.DISPLAY; ctx.textAlign = 'center'; ctx.fillText(a.letter, at(a.v), by + 12);
    }
    ctx.textAlign = 'left';
  };
  const gauges = (sum, choices) => {
    if (!sum) return;
    const BC = config.BUILD_CHECK, B = config.BALANCE, green = '#9cc48a', amber = '#e2bf6a', red = '#d98a80';
    const wd = B.WARN_PX * B.DEG_PER_PX, fd = Math.min(B.CAP_DEG, B.FAIL_PX * B.DEG_PER_PX), cap = B.CAP_DEG;
    const ch = choices || [];
    gauge(0, 'LIFT', `gas ${Math.round(sum.hover)}`, `weight ${Math.round(sum.mass)}, lift ${Math.round(sum.lift)}`, sum.hoverLevel, 0, 100,
      [[0, BC.HOVER_MIN, red], [BC.HOVER_MIN, BC.HOVER_WARN, green], [BC.HOVER_WARN, BC.HOVER_MAX, amber], [BC.HOVER_MAX, 100, red]], sum.hover, ch.map((c) => ({ letter: c.letter, v: c.summary.hover })));
    gauge(1, 'STEAM', `${Math.round(sum.cruise)} cruise`, `${Math.round(sum.idle)} idle, ${sum.boilers} boiler${sum.boilers === 1 ? '' : 's'}`, sum.steamLevel === 'NONE' ? 'WARN' : sum.steamLevel, 0, 100,
      [[0, BC.PRESS_CRUISE_MIN, red], [BC.PRESS_CRUISE_MIN, BC.PRESS_IDLE_MAX, green], [BC.PRESS_IDLE_MAX, 100, amber]], sum.cruise, ch.map((c) => ({ letter: c.letter, v: c.summary.cruise })));
    gauge(2, 'HANDS', `${sum.perPlayer} each`, `${sum.stations} stations to man (8 crew)`, sum.handsLevel, 0, 5,
      [[0, 1.5, amber], [1.5, BC.HANDS_PER_PLAYER, green], [BC.HANDS_PER_PLAYER, 5, red]], sum.perPlayer, ch.map((c) => ({ letter: c.letter, v: c.summary.perPlayer })));
    gauge(3, 'BALANCE', Math.abs(sum.deg) < 0.05 ? 'level' : `${sum.deg > 0 ? 'nose' : 'tail'}-heavy ${Math.abs(sum.deg)}°`, 'weight against lift', sum.balLevel, -cap, cap,
      [[-cap, -fd, red], [-fd, -wd, amber], [-wd, wd, green], [wd, fd, amber], [fd, cap, red]], sum.deg, ch.map((c) => ({ letter: c.letter, v: c.summary.deg })));
  };

  // ---- the paper note under the gauges ----
  const note = (lines) => {
    book.paper(NOTE.x, NOTE.y, NOTE.w, NOTE.h, { r: 12 });
    ctx.textAlign = 'left';
    let y = NOTE.y + 32;
    for (const [text, font, color, h] of lines) {
      ctx.font = font;
      ctx.fillStyle = color;
      for (const l of wrapLines(text, NOTE.w - 40).slice(0, 2)) { ctx.fillText(l, NOTE.x + 20, y, NOTE.w - 40); y += h; }
    }
  };

  // ---- a card: a picture, a name, what it does, what it costs ----
  const picture = (o, x, y, size) => {
    const c = o.pic && pics ? pics.get(o.pic, 96, o.picDir != null ? { dir: o.picDir } : {}) : null;
    if (c) ctx.drawImage(c, x, y, size, size);
    else { ctx.font = `${Math.round(size * 0.78)}px "Segoe UI Emoji", sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = L.INK; ctx.fillText(o.icon, x + size / 2, y + size * 0.78); }
  };
  const shopCards = (v, voters) => {
    const run = world.run, n = v.options.length, rows = Math.ceil(n / 2), gap = 14, cw = (RIGHT.w - gap) / 2, ch = Math.min(200, (RIGHT.h - (rows - 1) * gap) / rows);
    v.options.forEach((o, i) => {
      const x = RIGHT.x + (i % 2) * (cw + gap), y = RIGHT.y + Math.floor(i / 2) * (ch + gap);
      const off = o.kind !== 'cast' && (o.sold || o.cost > run.salvage), part = o.kind === 'part';
      ctx.globalAlpha = off ? 0.5 : 1;
      book.paper(x, y, cw, ch, { r: 14, pins: false, fill: part ? '#f4e2a8' : o.kind === 'cast' ? '#d6e3bc' : o.kind === 'repair' ? '#ecdcae' : null });
      picture(o, x + 14, y + 16, 72);
      ctx.textAlign = 'left';
      ctx.fillStyle = L.INK;
      ctx.font = '24px ' + config.FONTS.DISPLAY;
      ctx.fillText(o.name, x + 100, y + 38, cw - 112);
      ctx.font = '400 16px ' + config.FONTS.TEXT;
      wrapLines(o.desc, cw - 116).slice(0, 3).forEach((l, k) => ctx.fillText(l, x + 100, y + 62 + k * 20, cw - 112));
      if (o.kind !== 'cast') {
        ctx.font = '21px ' + config.FONTS.DISPLAY;
        ctx.fillStyle = off && !o.sold ? '#b3261e' : L.INK;
        ctx.fillText(o.sold ? 'SOLD' : o.cost === 0 ? 'FREE' : `Salvage ${o.cost}`, x + 100, y + ch - 18);
      }
      if (part && !o.sold) { // the part card wears a brass tag
        ctx.save();
        ctx.translate(x + cw - 12, y + 6);
        ctx.rotate(0.05);
        ctx.font = '700 12px ' + config.FONTS.TEXT;
        const t = o.badge + (o.spots > 1 ? ` - ${o.spots} places` : '');
        const tw = ctx.measureText(t).width + 14;
        ctx.fillStyle = o.derelict ? '#4f7f3f' : L.PIN_DARK;
        ctx.fillRect(-tw, 0, tw, 20);
        ctx.fillStyle = '#f3ead6';
        ctx.textAlign = 'right';
        ctx.fillText(t, -7, 14);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      dots(voters.filter((p) => p.vote === i), x + cw - 56, y + ch - 20);
    });
  };
  const slotCards = (v, voters) => {
    const gap = 16, n = v.options.length, ch = Math.min(230, (RIGHT.h - 64 - (n - 1) * gap) / n);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f3ead6';
    ctx.font = '700 18px ' + config.FONTS.TEXT;
    ctx.fillText('Everyone votes on their phone: the place with most votes wins (a tie is settled by the dice).', RIGHT.x, RIGHT.y + 14, RIGHT.w);
    v.part.choices.forEach((c, i) => {
      const y = RIGHT.y + 34 + i * (ch + gap);
      book.paper(RIGHT.x, y, RIGHT.w, ch, { r: 16, pins: false });
      ctx.beginPath(); ctx.arc(RIGHT.x + 76, y + ch / 2, 50, 0, 7); ctx.fillStyle = L.PIN; ctx.fill(); ctx.strokeStyle = L.INK; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = L.INK; ctx.textAlign = 'center'; ctx.font = '64px ' + config.FONTS.DISPLAY; ctx.fillText(c.letter, RIGHT.x + 76, y + ch / 2 + 22);
      ctx.textAlign = 'left';
      ctx.font = '32px ' + config.FONTS.DISPLAY;
      ctx.fillText(c.where, RIGHT.x + 150, y + 54, RIGHT.w - 190);
      ctx.font = '400 21px ' + config.FONTS.TEXT;
      ctx.fillStyle = c.warns && c.warns.length ? '#7a4a00' : L.INK_SOFT;
      wrapLines(c.note, RIGHT.w - 190).slice(0, 3).forEach((l, k) => ctx.fillText(l, RIGHT.x + 150, y + 90 + k * 26, RIGHT.w - 190));
      dots(voters.filter((p) => p.vote === i), RIGHT.x + RIGHT.w - 90, y + ch - 24);
    });
  };

  // ---- the screen ----
  const draw = (v, voters) => {
    const part = partOf(v), layout = world.ships[0].layout, Y = world.yard;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f3ead6';
    ctx.font = '40px ' + config.FONTS.DISPLAY;
    ctx.fillText(v.kind === 'slot' ? `WHERE DOES THE ${part.baseName.toUpperCase()} GO?` : "SKY-DOCK - THE SHIPWRIGHT'S YARD", 800, 78, 1100);
    ctx.font = '700 20px ' + config.FONTS.TEXT;
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(v.kind === 'slot' ? `Vote A, B or C on your phone  -  ${Math.max(0, Math.ceil(v.t))}s` : `Salvage: ${world.run.salvage}   -   vote on your phone: buy something or CAST OFF   -   ${Math.max(0, Math.ceil(v.t))}s`, 800, 116, 1100);
    ctx.fillStyle = '#f3ead6';
    ctx.font = '700 16px ' + config.FONTS.TEXT;
    ctx.textAlign = 'right';
    ctx.fillText('Spare gasbags', 1540, 40);
    spares(ctx, world, 1540, 82, true, 1);
    ctx.textAlign = 'center';
    const choices = part && (v.kind === 'slot' || !part.sold) ? part.choices : [];
    const pins = choices.map((c) => ({ x: c.x, y: c.y, letter: c.letter, ghost: c.ghost }));
    const built = Y.built;
    blueprint(layout, pins, built ? { text: 'BUILT', sub: `${built.name.toUpperCase()} - ${built.where.toUpperCase()}` } : null);
    gauges(Y.sum || (part && part.now), built ? [] : choices);
    if (v.kind === 'slot') {
      note([[part.desc, '400 17px ' + config.FONTS.TEXT, L.INK, 22], [`The lettered pins on the blueprint are the places; the brass letters on the gauges show what each would do.`, '400 15px ' + config.FONTS.TEXT, L.INK_SOFT, 20]]);
      slotCards(v, voters);
    } else {
      const lines = [];
      if (built) lines.push([`BUILT: ${built.name} (${built.where}). Cast off and watch her grow.`, '24px ' + config.FONTS.DISPLAY, GOOD, 30]);
      else if (part && !part.sold) {
        lines.push([`${part.baseName}: ${part.desc}`, '22px ' + config.FONTS.DISPLAY, L.INK, 28]);
        lines.push([part.choices.map((c) => `${c.letter} ${c.where}`).join('   '), '700 15px ' + config.FONTS.TEXT, L.INK_SOFT, 20]);
        lines.push([part.derelict ? 'A derelict drifts by: this part is FREE.' : 'Everybody votes for the part card: a quarter off.', '400 15px ' + config.FONTS.TEXT, part.derelict ? GOOD : L.INK_SOFT, 20]);
      } else lines.push(['Nothing more to build at this dock.', '400 18px ' + config.FONTS.TEXT, L.INK_SOFT, 24]);
      note(lines);
      shopCards(v, voters);
    }
  };

  // ---- "NEW: ENGINE POD", over the part, in the ship's own frame (cast off, then for a few seconds) ----
  const drawNew = (time) => {
    const n = world.yard && world.yard.newPart;
    if (!n || !(n.t > 0)) return;
    const a = Math.min(1, n.t / 1.5, (config.YARD.NEW_CALLOUT - n.t) / 0.5 + 0.2);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    const bob = Math.sin(time * 3) * 8, r = 70 + Math.sin(time * 4) * 8;
    ctx.beginPath();
    ctx.arc(n.x, n.y - 36, r, 0, 7);
    ctx.fillStyle = 'rgba(201,168,90,0.22)';
    ctx.fill();
    ctx.setLineDash([22, 12]);
    ctx.strokeStyle = L.PIN_DARK;
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(n.x, n.y - 36 - r);
    ctx.lineTo(n.x, n.y - 200 + bob + 40);
    ctx.strokeStyle = L.STAMP;
    ctx.lineWidth = 6;
    ctx.stroke();
    book.stamp('NEW: ' + n.name, n.x, n.y - 200 + bob, { size: 70, maxW: 1100 });
    ctx.restore();
  };

  return { isYard, draw, drawNew };
}
