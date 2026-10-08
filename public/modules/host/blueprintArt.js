// The blueprint view of a ship (Phase S.5b): the layout drawn in ink on cream paper, logbook style, with the 120 px column grid, the deck
// rows you can draw on, and the ghosts of what a pen or eraser stroke will do. Pure drawing: no state, no DOM (buildTest.js owns the
// canvas and the pointer; the in-game Shipwright's Yard (S.6b) can reuse it).
//   const v = blueprintView(layout, width, height, k)    the paper-to-ship transform (k = pixel ratio, for line weights and text)
//   drawBlueprint(ctx, v, layout, opts)                   opts: { rowHover, cursor, ghost, slots, hover, status }
//   v.toWorld(px, py) -> { x, y } in ship coordinates     v.X(x), v.Y(y) -> paper pixels
import { config } from '../../config.js';
import { COL, DECK_ROWS, rowOf, hullGeom } from './shipBuild.js';
import { EDIT_ROWS, DRAW_ROWS, GRID_X0 } from './buildEdit.js';

const LB = () => config.LOGBOOK;
const PAD = { l: 100, r: 28, t: 30, b: 46 }; // paper margins (CSS px, times k): row labels on the left, column numbers on top, the ship's size underneath
const GLYPH = { helm: 'H', boiler: 'B', lookout: 'L', coal: 'C', ammo: 'A', gun: 'G', searchlight: 'S', coil: 'Z', deflector: 'D', bombBay: 'M', navigator: 'N', escort: 'F', engine: 'E' };

export function blueprintView(Ly, w, h, k = 1) {
  const b = Ly.bounds || { x0: -240, x1: 1860, y0: -200, y1: 1000 };
  const wx0 = Math.min(b.x0, -240) - 20, wx1 = Math.max(b.x1, 1860) + 2 * COL; // (room to draw two columns beyond the ship before the view refits)
  const wy0 = Math.min(b.y0, -150) - 10, wy1 = Math.max(b.y1, DECK_ROWS.deep + 90);
  const pl = PAD.l * k, pr = PAD.r * k, pt = PAD.t * k, pb = PAD.b * k;
  const s = Math.min((w - pl - pr) / (wx1 - wx0), (h - pt - pb) / (wy1 - wy0));
  const ox = pl - wx0 * s + 4 * k, oy = pt + ((h - pt - pb) - (wy1 - wy0) * s) / 2 - wy0 * s; // (the ship hugs the left margin; the key goes on the right)
  return { s, ox, oy, k, w, h, world: { x0: wx0, x1: wx1, y0: wy0, y1: wy1 }, X: (x) => ox + x * s, Y: (y) => oy + y * s, toWorld: (px, py) => ({ x: (px - ox) / s, y: (py - oy) / s }) };
}

export function drawBlueprint(g, v, Ly, o = {}) {
  const L = LB(), k = v.k, { X, Y, s } = v;
  const font = (px, display) => `${Math.round(px * k)}px ${display ? config.FONTS.DISPLAY : config.FONTS.TEXT}`;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = L.PAPER;
  g.fillRect(0, 0, v.w, v.h);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const line = (pts, width, color = L.INK, dash = null) => {
    g.strokeStyle = color;
    g.lineWidth = width * k;
    g.setLineDash(dash ? dash.map((d) => d * k) : []);
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    g.setLineDash([]);
  };
  const text = (t, x, y, size, color = L.INK, align = 'left', display = false) => {
    g.font = font(size, display);
    g.fillStyle = color;
    g.textAlign = align;
    g.fillText(t, x, y);
  };
  const W = v.world;
  // The column grid, numbered along the top, and the rows decks can be drawn on.
  for (let x = GRID_X0 + Math.ceil((W.x0 - GRID_X0) / COL) * COL, n = Math.ceil((W.x0 - GRID_X0) / COL); x <= W.x1; x += COL, n++) {
    line([[X(x), PAD.t * k - 6 * k], [X(x), v.h - PAD.b * k + 8 * k]], 1, 'rgba(107,74,50,0.2)', [3, 5]);
    text(String(n), X(x), PAD.t * k - 10 * k, 9, L.INK_SOFT, 'center');
  }
  for (const row of DRAW_ROWS) {
    const y = Y(DECK_ROWS[row]), hot = o.rowHover === row;
    if (hot) { g.fillStyle = 'rgba(201,168,90,0.28)'; g.fillRect(PAD.l * k - 8 * k, y - 22 * k, X(W.x1) - PAD.l * k + 8 * k, 44 * k); }
    line([[PAD.l * k - 8 * k, y], [X(W.x1), y]], hot ? 1.5 : 1, hot ? L.INK_SOFT : 'rgba(107,74,50,0.32)', [8, 6]);
    const have = Ly.platforms.some((q) => q.y === DECK_ROWS[row]);
    text(EDIT_ROWS[row].name.toUpperCase(), PAD.l * k - 12 * k, y + 4 * k, 11, have ? L.INK : L.INK_SOFT, 'right');
    if (!have) text('(empty row)', PAD.l * k - 12 * k, y + 18 * k, 9, L.INK_SOFT, 'right');
  }

  // The gasbag(s), light hatching inside.
  const bag = Ly.gasbag;
  if (bag) {
    const env = (cx, cy, rx, ry, tag) => {
      g.beginPath(); g.ellipse(X(cx), Y(cy), rx * s, ry * s, 0, 0, 6.2832);
      g.fillStyle = 'rgba(107,74,50,0.07)'; g.fill();
      g.strokeStyle = L.INK; g.lineWidth = 2 * k; g.stroke();
      g.save(); g.clip();
      for (let hx = cx - rx - ry; hx < cx + rx; hx += 46) line([[X(hx), Y(cy + ry)], [X(hx + ry), Y(cy - ry)]], 1, 'rgba(107,74,50,0.14)');
      g.restore();
      text(tag, X(cx), Y(cy) + 5 * k, 14, L.INK_SOFT, 'center', true);
    };
    if (bag.twin) env(bag.cx - 20, bag.cy - 258, bag.rx * 0.7, bag.ry * 0.62, 'twin');
    env(bag.cx, bag.cy, bag.rx, bag.ry, `GASBAG  ${Math.round(bag.rx * 2)} px`);
  }

  // The hull, as the art encloses the decks.
  const H = hullGeom(Ly.platforms, Ly.rooms);
  if (H) {
    g.beginPath();
    g.moveTo(X(H.xL), Y(H.top));
    g.lineTo(X(H.xTopR), Y(H.top));
    g.quadraticCurveTo(X(H.xR), Y(H.top + 4), X(H.xR), Y(H.yShoulder));
    g.quadraticCurveTo(X(H.xR - 4), Y(H.yTuck), X(H.xNose), Y(H.yTuck2));
    g.lineTo(X(H.xKeelR), Y(H.yKeel));
    g.lineTo(X(H.xKeelL), Y(H.yKeel));
    g.lineTo(X(H.xL2), Y(H.yTuck2));
    g.closePath();
    g.fillStyle = 'rgba(201,168,90,0.16)'; g.fill();
    g.strokeStyle = L.INK; g.lineWidth = 2.4 * k; g.stroke();
    for (const b of H.boxes) {
      g.beginPath();
      g.moveTo(X(b.x0), Y(b.y0)); g.lineTo(X(b.x1), Y(b.y0)); g.lineTo(X(b.x1), Y(b.y1 - 26)); g.lineTo(X(b.x1 - 26), Y(b.y1));
      g.lineTo(X(b.x0 + 26), Y(b.y1)); g.lineTo(X(b.x0), Y(b.y1 - 26)); g.closePath();
      g.fillStyle = 'rgba(201,168,90,0.16)'; g.fill();
      g.strokeStyle = L.INK; g.lineWidth = 2.4 * k; g.stroke();
    }
  }

  // Decks (thick ink), room dividers, ways between decks.
  const P = Ly.platforms;
  for (const r of Ly.rooms) { const q = P[r.d]; if (q) for (const x of [r.x0, r.x1]) line([[X(x), Y(q.y) - 26 * k], [X(x), Y(q.y)]], 1, 'rgba(58,44,32,0.35)'); }
  for (const q of P) {
    const dashed = q.outside && rowOf(q) !== 'catwalk';
    line([[X(q.x0), Y(q.y)], [X(q.x1), Y(q.y)]], q.outside ? 3.5 : 5, L.INK, dashed ? [10, 4] : null);
    for (const x of [q.x0, q.x1]) line([[X(x), Y(q.y) - 5 * k], [X(x), Y(q.y) + 5 * k]], 2);
    if (q.x1 - q.x0 > 220) text(q.name, X(q.x0) + 4 * k, Y(q.y) + 14 * k, 9, L.INK_SOFT);
  }
  for (const c of Ly.connectors) {
    const t = P[c.top], b = P[c.bottom];
    if (!t || !b) continue;
    const x0 = X(c.xTop), y0 = Y(t.y), x1 = X(c.xBottom), y1 = Y(b.y), d = 4 * k;
    if (c.type === 'ladder') {
      line([[x0 - d, y0], [x1 - d, y1]], 1.4); line([[x0 + d, y0], [x1 + d, y1]], 1.4);
      for (let t2 = 0.06; t2 < 1; t2 += 0.12 / Math.max(1, (y1 - y0) / (30 * k))) line([[x0 - d + (x1 - x0) * t2, y0 + (y1 - y0) * t2], [x0 + d + (x1 - x0) * t2, y0 + (y1 - y0) * t2]], 1);
    } else if (c.type === 'pole') {
      line([[x0, y0], [x1, y1]], 3, L.INK, [2, 5]);
      line([[x1 - 5 * k, y1 - 9 * k], [x1, y1], [x1 + 5 * k, y1 - 9 * k]], 1.6);
    } else if (c.type === 'rope') line([[x0, y0], [x1, y1]], 1.6, L.INK, [5, 3]);
    else if (c.type === 'lift') { line([[x0 - d, y0], [x1 - d, y1]], 1.4); line([[x0 + d, y0], [x1 + d, y1]], 1.4); g.strokeStyle = L.INK; g.lineWidth = 1.6 * k; g.strokeRect(x0 - d - 2 * k, y1 - 14 * k, 2 * d + 4 * k, 14 * k); }
    else line([[x0, y0], [x1, y1]], 2.4);
  }
  // Stations (a letter on a disc, standing on the deck), engines, racks.
  const disc = (x, y, ch, r, fill = L.PAPER) => {
    g.beginPath(); g.arc(x, y, r * k, 0, 6.2832); g.fillStyle = fill; g.fill();
    g.strokeStyle = L.INK; g.lineWidth = 1.6 * k; g.stroke();
    text(ch, x, y + 3.5 * k, 10, L.INK, 'center', true);
  };
  for (const st of Ly.stations) {
    const q = P[st.d];
    if (!q) continue;
    const m = (Ly.gunMounts || {})[st.n] || (Ly.searchlights || {})[st.n];
    if (m) line([[X(m.bx), Y(m.by)], [X(m.bx + Math.cos(m.aim) * 34), Y(m.by + Math.sin(m.aim) * 34)]], 2.4, L.INK_SOFT);
    disc(X(st.x), Y(q.y) - 11 * k, GLYPH[st.kind] || '?', 7.5);
  }
  for (const e of Ly.engines) { const q = P[e.d]; if (q) disc(X(e.x), Y(q.y) + 14 * k, 'E', 7.5, 'rgba(201,168,90,0.5)'); }
  g.fillStyle = L.INK_SOFT;
  for (const r of [...Ly.racks, ...Ly.vents, ...Ly.extinguishers]) { const q = P[r.d]; if (q) g.fillRect(X(r.x) - 2 * k, Y(q.y) - 8 * k, 4 * k, 8 * k); }
  if (Ly.medbay) { const q = P.find((d) => d.id === Ly.medbay.p); if (q) text('+', X(Ly.medbay.x), Y(q.y) - 4 * k, 16, L.STAMP, 'center', true); }

  // The size of the ship, along the bottom and the right edge.
  if (Ly.bounds) {
    const B = Ly.bounds, yb = v.h - PAD.b * k + 22 * k;
    line([[X(B.x0), yb], [X(B.x1), yb]], 1.2, L.INK_SOFT);
    for (const x of [B.x0, B.x1]) line([[X(x), yb - 4 * k], [X(x), yb + 4 * k]], 1.2, L.INK_SOFT);
    text(`${Math.round(B.x1 - B.x0)} px = ${((B.x1 - B.x0) / COL).toFixed(1)} columns long, ${Math.round(B.y1 - B.y0)} px tall`, X((B.x0 + B.x1) / 2), yb + 14 * k, 11, L.INK_SOFT, 'center');
  }

  // The key, on the empty paper to the right of the ship.
  const kx = X(W.x1) + 16 * k;
  if (v.w - kx > 200 * k) {
    const rows = ['PENCIL: drag along a deck row.', 'Along a deck it gets longer; on an', 'empty stretch it makes a new deck', '(rooms, hull and a ladder come too).', '', 'ERASER: drag along a deck. It gets', 'shorter, splits or goes, with what', 'stood on it (listed below).', '', 'Lines snap to the column grid and', 'to deck ends. Rows: top deck, main,', 'lower, keel, deep.', '', 'H helm  B boiler  L lookout', 'C coal  A ammo  G gun  S lamp', 'Z coil  D deflector  M bomb bay', 'N navigator  F fighter  E engine'];
    text('HOW TO', kx, PAD.t * k + 16 * k, 14, L.INK, 'left', true);
    rows.forEach((t, i) => text(t, kx, PAD.t * k + 36 * k + i * 15 * k, 11, i < 13 ? L.INK_SOFT : L.INK));
  }

  // Part slots (brass pins) when a part is picked from the palette.
  for (const sl of o.slots || []) {
    const on = o.hover === sl, y = Y(sl.y) - 30 * k * 0.6;
    g.beginPath(); g.arc(X(sl.x), y, (on ? 9 : 6) * k, 0, 6.2832);
    g.fillStyle = on ? '#ffe9a0' : L.PIN; g.fill();
    g.strokeStyle = L.INK; g.lineWidth = 1.8 * k; g.stroke();
  }
  if (o.hover && o.hover.label) text(o.hover.label, X(o.hover.x), Y(o.hover.y) - 38 * k, 12, L.INK, 'center', true);

  // The pen and eraser.
  if (o.cursor) { line([[X(o.cursor.x), Y(o.cursor.y) - 8 * k], [X(o.cursor.x), Y(o.cursor.y) + 8 * k]], 2, L.STAMP); line([[X(o.cursor.x) - 8 * k, Y(o.cursor.y)], [X(o.cursor.x) + 8 * k, Y(o.cursor.y)]], 2, L.STAMP); }
  const gh = o.ghost;
  if (gh) {
    const y = Y(DECK_ROWS[gh.row]), good = gh.ok;
    if (gh.tool === 'erase') {
      g.fillStyle = good ? 'rgba(168,68,63,0.22)' : 'rgba(107,74,50,0.12)';
      g.fillRect(X(gh.x0), y - 26 * k, (gh.x1 - gh.x0) * s, 52 * k);
      for (let hx = gh.x0; hx < gh.x1; hx += 24) line([[X(hx), y + 26 * k], [X(Math.min(gh.x1, hx + 14)), y - 26 * k]], 1.4, good ? L.STAMP : L.INK_SOFT);
    } else {
      line([[X(gh.x0), y], [X(gh.x1), y]], 7, good ? '#4f7f3f' : L.STAMP, good ? null : [10, 8]);
      for (const x of [gh.x0, gh.x1]) line([[X(x), y - 12 * k], [X(x), y + 12 * k]], 3, good ? '#4f7f3f' : L.STAMP);
    }
    if (gh.label) {
      g.font = font(12, false);
      const tw = g.measureText(gh.label).width, tx = Math.max(PAD.l * k, Math.min(v.w - tw - 14 * k, X((gh.x0 + gh.x1) / 2) - tw / 2)), ty = y - 36 * k;
      g.fillStyle = 'rgba(243,234,214,0.94)'; g.fillRect(tx - 6 * k, ty - 14 * k, tw + 12 * k, 20 * k);
      g.strokeStyle = good ? L.INK : L.STAMP; g.lineWidth = 1.4 * k; g.strokeRect(tx - 6 * k, ty - 14 * k, tw + 12 * k, 20 * k);
      text(gh.label, tx, ty, 12, good ? L.INK : L.STAMP);
    }
  }
  // Can she fly?
  if (o.status && !o.status.ok) {
    g.save();
    g.translate(v.w - PAD.r * k - 6 * k, v.h - PAD.b * k - 14 * k); // (bottom right, clear of the key)
    g.rotate(-0.03);
    g.font = font(14, true);
    const tw = Math.min(v.w * 0.6, g.measureText(o.status.text).width);
    g.fillStyle = L.STAMP_BG; g.fillRect(-tw - 18 * k, -16 * k, tw + 18 * k, 30 * k);
    g.strokeStyle = L.STAMP; g.lineWidth = 2.6 * k; g.strokeRect(-tw - 18 * k, -16 * k, tw + 18 * k, 30 * k);
    g.fillStyle = L.STAMP; g.textAlign = 'right';
    g.fillText(o.status.text, -9 * k, 5 * k, tw);
    g.restore();
  }
  g.restore();
}
