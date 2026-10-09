// The blueprint view of a ship (Phase S.5b): the layout drawn in ink on cream paper, logbook style, with the 120 px column grid, the deck
// rows you can draw on, and the ghosts of what a pen or eraser stroke will do. Pure drawing: no state, no DOM (buildTest.js owns the
// canvas and the pointer; the in-game Shipwright's Yard (S.6b) can reuse it).
//   const v = blueprintView(layout, width, height, k)    the paper-to-ship transform (k = pixel ratio, for line weights and text)
//   drawBlueprint(ctx, v, layout, opts)                   opts: { rowHover, cursor, ghost, slots, hover, status, balance, target, needs, selBag (the bag the Gas buttons act on: a brass outline) }
//     balance: shipBuild.js balanceOf (the centre of mass / lift markers), target: { x, y, r, label } the thing the delete tool is over, needs: what a half-built ship still lacks
//   v.toWorld(px, py) -> { x, y } in ship coordinates     v.X(x), v.Y(y) -> paper pixels
// The in-game Shipwright's Yard (S.6b, yardArt.js) draws it CLEAN: blueprintView(layout, w, h, k, true) fits the ship with small margins, and opts.clean skips the grid, the row guides, the
// key and the size line. opts.pins = [{ x, y, letter, ghost }]: the places a part could go (a dashed ghost box, a brass pin with its letter); opts.stamp = { text, sub }: a red stamp (BUILT).
import { config } from '../../config.js';
import { COL, DECK_ROWS, rowOf, hullGeom, bagList } from './shipBuild.js';
import { EDIT_ROWS, DRAW_ROWS, GRID_X0 } from './buildEdit.js';
import { gasKey } from './gases.js';

const LB = () => config.LOGBOOK;
const PAD = { l: 100, r: 28, t: 30, b: 46 }; // paper margins (CSS px, times k): row labels on the left, column numbers on top, the ship's size underneath
const GLYPH = { helm: 'H', boiler: 'B', lookout: 'L', coal: 'C', ammo: 'A', gun: 'G', searchlight: 'S', coil: 'Z', deflector: 'D', bombBay: 'M', navigator: 'N', escort: 'F', engine: 'E', sail: 'W', swivel: 'X', cannon: 'K', cannonSeat: 'k' };

export function blueprintView(Ly, w, h, k = 1, clean = false) {
  const b = Ly.bounds || { x0: -240, x1: 1860, y0: -200, y1: 1000 };
  if (clean) { // (the Yard: just the ship, with room for a ghost bay at either end and a keel deck under her)
    const pad = { l: 14, r: 14, t: 14, b: 14 };
    const wx0 = b.x0 - 150, wx1 = b.x1 + 150, wy0 = Math.min(b.y0, -40) - 40, wy1 = Math.max(b.y1, DECK_ROWS.keel + 20) + 50;
    const s = Math.min((w - (pad.l + pad.r) * k) / (wx1 - wx0), (h - (pad.t + pad.b) * k) / (wy1 - wy0));
    const ox = (w - (wx1 - wx0) * s) / 2 - wx0 * s, oy = (h - (wy1 - wy0) * s) / 2 - wy0 * s;
    return { s, ox, oy, k, w, h, pad, clean: true, world: { x0: wx0, x1: wx1, y0: wy0, y1: wy1 }, X: (x) => ox + x * s, Y: (y) => oy + y * s, toWorld: (px, py) => ({ x: (px - ox) / s, y: (py - oy) / s }) };
  }
  const wx0 = Math.min(b.x0, -240) - 20, wx1 = Math.max(b.x1, 1860) + 2 * COL; // (room to draw two columns beyond the ship before the view refits)
  const wy0 = Math.min(b.y0, DECK_ROWS.crow2 - 40) - 10, wy1 = Math.max(b.y1, DECK_ROWS.deep + 90);
  const pl = PAD.l * k, pr = PAD.r * k, pt = PAD.t * k, pb = PAD.b * k;
  const s = Math.min((w - pl - pr) / (wx1 - wx0), (h - pt - pb) / (wy1 - wy0));
  const ox = pl - wx0 * s + 4 * k, oy = pt + ((h - pt - pb) - (wy1 - wy0) * s) / 2 - wy0 * s; // (the ship hugs the left margin; the key goes on the right)
  return { s, ox, oy, k, w, h, world: { x0: wx0, x1: wx1, y0: wy0, y1: wy1 }, X: (x) => ox + x * s, Y: (y) => oy + y * s, toWorld: (px, py) => ({ x: (px - ox) / s, y: (py - oy) / s }) };
}

// Where the tip of an engine's thrust arrow is on the paper (paper pixels): 26 px of paper out from the engine's disc, along its direction (the page hit-tests the turning handle here).
export function engineArrow(v, e, q) {
  const dir = e.dir || 0, len = 26 * v.k;
  return { x: v.X(e.x) + Math.cos(dir) * len, y: v.Y(q.y) + 14 * v.k + Math.sin(dir) * len };
}

export function drawBlueprint(g, v, Ly, o = {}) {
  const L = LB(), k = v.k, { X, Y, s } = v;
  const pad = v.pad || PAD, clean = !!o.clean;
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
  if (!clean) for (let x = GRID_X0 + Math.ceil((W.x0 - GRID_X0) / COL) * COL, n = Math.ceil((W.x0 - GRID_X0) / COL); x <= W.x1; x += COL, n++) {
    line([[X(x), pad.t * k - 6 * k], [X(x), v.h - pad.b * k + 8 * k]], 1, 'rgba(107,74,50,0.2)', [3, 5]);
    text(String(n), X(x), pad.t * k - 10 * k, 9, L.INK_SOFT, 'center');
  }
  if (!clean) for (const row of DRAW_ROWS) {
    const y = Y(DECK_ROWS[row]), hot = o.rowHover === row;
    if (hot) { g.fillStyle = 'rgba(201,168,90,0.28)'; g.fillRect(pad.l * k - 8 * k, y - 22 * k, X(W.x1) - pad.l * k + 8 * k, 44 * k); }
    line([[pad.l * k - 8 * k, y], [X(W.x1), y]], hot ? 1.5 : 1, hot ? L.INK_SOFT : 'rgba(107,74,50,0.32)', [8, 6]);
    const have = Ly.platforms.some((q) => q.y === DECK_ROWS[row]);
    text(EDIT_ROWS[row].name.toUpperCase(), pad.l * k - 12 * k, y + 4 * k, 11, have ? L.INK : L.INK_SOFT, 'right');
    if (!have) text('(empty row)', pad.l * k - 12 * k, y + 18 * k, 9, L.INK_SOFT, 'right');
  }
  if (!clean) { // the gasbag row: a band where the bag is drawn (a dashed line while there is no bag)
    const y = Y(config.BUILD_EDIT.BAG_CY), hot = o.rowHover === 'gasbag';
    if (hot) { g.fillStyle = 'rgba(201,168,90,0.28)'; g.fillRect(pad.l * k - 8 * k, y - 22 * k, X(W.x1) - pad.l * k + 8 * k, 44 * k); }
    if (!Ly.gasbag || hot) line([[pad.l * k - 8 * k, y], [X(W.x1), y]], hot ? 1.5 : 1, hot ? L.INK_SOFT : 'rgba(107,74,50,0.32)', [8, 6]);
    const nb = bagList(Ly).length;
    text(nb > 1 ? `GASBAGS x${nb}` : 'GASBAG', pad.l * k - 12 * k, y + 4 * k, 11, Ly.gasbag ? L.INK : L.INK_SOFT, 'right');
    text(Ly.gasbag ? '(drag: add more)' : '(none: drag to draw)', pad.l * k - 12 * k, y + 18 * k, 9, L.INK_SOFT, 'right');
  }
  if (!clean && !Ly.platforms.length && !Ly.gasbag) { // an empty sheet
    const cx = X(560), ty = Y(DECK_ROWS.catwalk) - 40 * k;
    g.fillStyle = 'rgba(243,234,214,0.9)'; g.fillRect(cx - 250 * k, ty - 22 * k, 500 * k, 70 * k);
    text('An empty sheet.', cx, ty, 15, L.INK, 'center', true);
    text('Pencil: drag along the MAIN DECK row for the first deck.', cx, ty + 20 * k, 12, L.INK_SOFT, 'center');
    text('Gasbag tool: draw the bag. Parts come from the palette.', cx, ty + 38 * k, 12, L.INK_SOFT, 'center');
  }

  // The gasbag(s) side by side, light hatching inside, with a handle at each end to drag (the Gasbag tool).
  const bags = bagList(Ly);
  if (bags.length) {
    // gas: the bag's gas (gases.js): a tint of its own; hydrogen wears a red stencil, hot air a patched canvas and a burner under it. sel: the bag the Gas buttons act on (a brass outline)
    const env = (cx, cy, rx, ry, tag, gas = 'helium', sel = false) => {
      g.beginPath(); g.ellipse(X(cx), Y(cy), rx * s, ry * s, 0, 0, 6.2832);
      g.fillStyle = 'rgba(107,74,50,0.07)'; g.fill();
      g.fillStyle = config.GASES[gas].tint; g.fill();
      g.strokeStyle = sel ? L.PIN : L.INK; g.lineWidth = (sel ? 4 : 2) * k; g.stroke();
      g.save(); g.clip();
      for (let hx = cx - rx - ry; hx < cx + rx; hx += 46) line([[X(hx), Y(cy + ry)], [X(hx + ry), Y(cy - ry)]], 1, 'rgba(107,74,50,0.14)');
      if (gas === 'hot') for (const [px, py] of [[-0.55, -0.1], [-0.15, 0.35], [0.3, -0.3], [0.62, 0.2]]) { // patched canvas
        const qx = X(cx + px * rx) - 20 * s, qy = Y(cy + py * ry) - 14 * s;
        g.fillStyle = 'rgba(150,105,60,0.35)'; g.fillRect(qx, qy, 40 * s, 28 * s);
        g.strokeStyle = L.INK_SOFT; g.lineWidth = k; g.setLineDash([3 * k, 3 * k]); g.strokeRect(qx, qy, 40 * s, 28 * s); g.setLineDash([]);
      }
      g.restore();
      if (tag) text(tag, X(cx), Y(cy - ry * 0.55) + 5 * k, bags.length > 2 ? 11 : 14, L.INK_SOFT, 'center', true);
      if (gas === 'hydrogen') { // the red stencil
        g.save(); g.translate(X(cx), Y(cy + ry * 0.12)); g.rotate(-0.03);
        g.strokeStyle = L.STAMP; g.fillStyle = L.STAMP; g.lineWidth = 2 * k; g.globalAlpha = 0.85;
        const fs = Math.max(12, Math.min(34, (rx * s) / k / 5.5));
        g.font = `${Math.round(fs * k)}px ${config.FONTS.DISPLAY}`; g.textAlign = 'center';
        const word = 'H2 - NO FLAMES', tw = g.measureText(word).width;
        g.strokeRect(-tw / 2 - 8 * k, -fs * k * 0.95, tw + 16 * k, fs * k * 1.3);
        g.fillText(word, 0, 0);
        g.restore();
      } else if (gas === 'hot') { // a burner basket under the envelope, and its little flame
        const bx = X(cx), by = Y(cy + ry) + 10 * k;
        line([[bx - 14 * k, by - 8 * k], [bx - 10 * k, by + 4 * k], [bx + 10 * k, by + 4 * k], [bx + 14 * k, by - 8 * k]], 2, L.INK);
        g.beginPath(); g.moveTo(bx - 5 * k, by - 6 * k); g.quadraticCurveTo(bx, by - 22 * k, bx + 5 * k, by - 6 * k); g.fillStyle = 'rgba(230,110,30,0.85)'; g.fill();
        text('HOT AIR', X(cx), Y(cy + ry * 0.35), 11, L.INK_SOFT, 'center', true);
      }
    };
    bags.forEach((bag, i) => {
      const gas = gasKey(bag), nm = gas === 'helium' ? '' : '  ' + config.GASES[gas].short;
      if (bag.twin) env(bag.cx - 20, bag.cy - 258, bag.rx * 0.7, bag.ry * 0.62, 'twin', gas);
      env(bag.cx, bag.cy, bag.rx, bag.ry, (bags.length === 1 ? `GASBAG  ${Math.round(bag.rx * 2)} px` : `BAG ${i + 1}  ${Math.round(bag.rx * 2)} px`) + nm, gas, o.selBag === i);
    });
    if (o.bagHandles) for (const bag of bags) for (const x of [bag.cx - bag.rx, bag.cx + bag.rx]) { // the ends: grab one to resize
      g.beginPath(); g.arc(X(x), Y(bag.cy), 6 * k, 0, 6.2832); g.fillStyle = L.PIN; g.fill(); g.strokeStyle = L.INK; g.lineWidth = 1.6 * k; g.stroke();
    }
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

  // The RAM PROW (config.RAM): the long iron beak off the fore end of its deck, inked in the same pen with a ruled outline, plate seams, rivets and a stripe.
  if (Ly.ram && Ly.ram.pts) {
    const { x, y, tipX } = Ly.ram, hh = config.RAM.HALF, pts = Ly.ram.pts;
    for (const sx of [136, 226, 316]) for (const f of [-1, 1]) { // the spikes, leaning forward
      const e = (u) => hh - (hh - config.RAM.TIP_HALF) * ((u - 50) / (config.RAM.TIP - 50));
      g.beginPath(); g.moveTo(X(x + sx - 15), Y(y + f * e(sx - 15))); g.lineTo(X(x + sx + 38), Y(y + f * (e(sx) + 40))); g.lineTo(X(x + sx + 14), Y(y + f * e(sx + 14))); g.closePath();
      g.fillStyle = 'rgba(58,44,32,0.55)'; g.fill(); g.strokeStyle = L.INK; g.lineWidth = 1.8 * k; g.stroke();
    }
    g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(X(px), Y(py)) : g.moveTo(X(px), Y(py)))); g.closePath();
    g.fillStyle = 'rgba(58,44,32,0.28)'; g.fill();
    g.strokeStyle = L.INK; g.lineWidth = 2.6 * k; g.stroke();
    g.fillStyle = 'rgba(168,68,63,0.5)'; g.fillRect(X(x + 84), Y(y - hh * 0.72), 40 * s, hh * 1.44 * s); // (the team stripe)
    for (const sx of [200, 290]) line([[X(x + sx), Y(y - hh * 0.36)], [X(x + sx), Y(y + hh * 0.36)]], 1.2, L.INK_SOFT);
    for (const sx of [110, 160, 240, 330]) for (const f of [-0.3, 0.3]) { g.beginPath(); g.arc(X(x + sx), Y(y + f * hh), 1.7 * k, 0, 6.2832); g.fillStyle = 'rgba(243,234,214,0.9)'; g.fill(); }
    line([[X(x - 30), Y(y)], [X(tipX), Y(y)]], 1, L.INK_SOFT, [6, 4]);
    if (!clean) text('RAM PROW', X(x + 240), Y(y - hh) - 8 * k, 10, L.INK_SOFT, 'center', true);
  }

  // Decks (thick ink), room dividers, ways between decks.
  const P = Ly.platforms;
  // A CARGO DROP HATCH (config.HATCH): hazard-striped trapdoors set into the deck between screen x a and b at height y, and the red-handled lever beside them (lever = its screen x). ghost: a place it could go.
  const hatchMark = (a, b, y, lever, ghost) => {
    g.save();
    g.beginPath(); g.rect(a, y - 6 * k, b - a, 11 * k); g.clip();
    g.fillStyle = ghost ? 'rgba(232,184,48,0.4)' : 'rgba(232,184,48,0.88)'; g.fillRect(a, y - 6 * k, b - a, 11 * k);
    g.strokeStyle = 'rgba(43,38,34,0.85)'; g.lineWidth = 3 * k;
    for (let x = a - 12 * k; x < b + 12 * k; x += 9 * k) { g.beginPath(); g.moveTo(x, y + 5 * k); g.lineTo(x + 11 * k, y - 6 * k); g.stroke(); }
    g.restore();
    g.strokeStyle = ghost ? '#4f7f3f' : L.INK; g.lineWidth = 1.8 * k; g.strokeRect(a, y - 6 * k, b - a, 11 * k);
    line([[(a + b) / 2, y - 6 * k], [(a + b) / 2, y + 5 * k]], 1.2);
    if (lever != null) {
      line([[lever, y], [lever, y - 14 * k]], 2);
      g.beginPath(); g.arc(lever + 3 * k, y - 17 * k, 3.4 * k, 0, 6.2832); g.fillStyle = L.STAMP; g.fill(); g.strokeStyle = L.INK; g.lineWidth = 1.2 * k; g.stroke();
    }
  };
  for (const r of Ly.rooms) { const q = P[r.d]; if (q) for (const x of [r.x0, r.x1]) line([[X(x), Y(q.y) - 26 * k], [X(x), Y(q.y)]], 1, 'rgba(58,44,32,0.35)'); }
  const BODY = ['catwalk', 'main', 'lower', 'keel', 'deep'];
  for (const q of P) {
    const body = BODY.includes(rowOf(q));
    const dashed = q.outside && !body;
    line([[X(q.x0), Y(q.y)], [X(q.x1), Y(q.y)]], q.outside ? 3.5 : 5, L.INK, dashed ? [10, 4] : null);
    for (const x of [q.x0, q.x1]) line([[X(x), Y(q.y) - 5 * k], [X(x), Y(q.y) + 5 * k]], 2);
    if (q.outside && body) { // an OUTDOOR deck (S.5g): a rail with posts along it, open sky above
      line([[X(q.x0), Y(q.y) - 22 * k], [X(q.x1), Y(q.y) - 22 * k]], 1.4, L.INK);
      for (let x = q.x0 + 30; x < q.x1; x += 90) line([[X(x), Y(q.y)], [X(x), Y(q.y) - 22 * k]], 1.4, L.INK);
    } else if (!q.outside && rowOf(q) === 'catwalk') { // a COVERED top deck: a cabin with a roof over it
      const top = Y(q.y) - 66 * k;
      g.fillStyle = 'rgba(201,168,90,0.16)'; g.fillRect(X(q.x0) - 4 * k, top, (q.x1 - q.x0) * s + 8 * k, Y(q.y) - top);
      g.strokeStyle = L.INK; g.lineWidth = 2.4 * k; g.strokeRect(X(q.x0) - 4 * k, top, (q.x1 - q.x0) * s + 8 * k, Y(q.y) - top);
    }
    if (!clean && q.x1 - q.x0 > 220) text(q.name + (body ? (q.outside ? ' (outdoor)' : ' (covered)') : ''), X(q.x0) + 4 * k, Y(q.y) + 14 * k, 9, L.INK_SOFT);
  }
  for (const a of Ly.armour || []) { // ARMOUR plate (S.5g): a riveted iron band along the hull wall under a covered deck, or the rail of an open one
    const q = P[a.d];
    if (!q) continue;
    const y0 = q.outside ? Y(q.y) - 24 * k : Y(q.y) + 4 * k, h = q.outside ? 24 * k : 22 * k;
    g.fillStyle = 'rgba(58,44,32,0.62)'; g.fillRect(X(a.x0), y0, (a.x1 - a.x0) * s, h);
    g.strokeStyle = L.INK; g.lineWidth = 1.6 * k; g.strokeRect(X(a.x0), y0, (a.x1 - a.x0) * s, h);
    g.fillStyle = 'rgba(243,234,214,0.9)';
    for (let x = a.x0 + 14; x < a.x1 - 6; x += 28) { g.beginPath(); g.arc(X(x), y0 + h / 2, 1.8 * k, 0, 6.2832); g.fill(); }
    if (a.x1 - a.x0 > 160) text('ARMOUR', X((a.x0 + a.x1) / 2), y0 + h + 11 * k, 9, L.INK_SOFT, 'center');
  }
  for (const h of Ly.hatches || []) { // the cargo drop hatches
    const q = P[h.d];
    if (!q) continue;
    hatchMark(X(h.x0), X(h.x1), Y(q.y), X(h.lx));
    if (!clean && h.x1 - h.x0 >= 110) text(`HATCH ${Math.round((h.x1 - h.x0) / 120)}`, X((h.x0 + h.x1) / 2), Y(q.y) + 17 * k, 9, L.INK_SOFT, 'center');
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
  const arrow = (x0, y0, x1, y1, color) => { // a thrust arrow with a head
    const a = Math.atan2(y1 - y0, x1 - x0), h = 6 * k;
    line([[x0, y0], [x1, y1]], 2.6, color);
    line([[x1 - Math.cos(a - 0.45) * h, y1 - Math.sin(a - 0.45) * h], [x1, y1], [x1 - Math.cos(a + 0.45) * h, y1 - Math.sin(a + 0.45) * h]], 2.6, color);
  };
  for (const st of Ly.stations) {
    const q = P[st.d];
    if (!q) continue;
    const m = (Ly.gunMounts || {})[st.n] || (Ly.searchlights || {})[st.n];
    if (m) line([[X(m.bx), Y(m.by)], [X(m.bx + Math.cos(m.aim) * 34), Y(m.by + Math.sin(m.aim) * 34)]], 2.4, L.INK_SOFT);
    if (m && m.type === 'flame') { // a flamethrower's mark: a little red cone of fire at the end of its barrel (the flame's reach is far longer; the key shows the range)
      const tx = m.bx + Math.cos(m.aim) * 34, ty = m.by + Math.sin(m.aim) * 34;
      for (const da of [-0.3, 0, 0.3]) line([[X(tx), Y(ty)], [X(tx + Math.cos(m.aim + da) * 40), Y(ty + Math.sin(m.aim + da) * 40)]], 2, L.STAMP);
    }
    const cn = st.kind === 'cannonSeat' ? (Ly.cannons || []).find((c) => c.n + ' Seat' === st.n) : null; // (B.6: the crew cannon's barrel, drawn from its seat)
    if (cn) line([[X(cn.x), Y(q.y) - 14 * k], [X(cn.x + Math.cos(cn.aim) * 70), Y(q.y - 14 + Math.sin(cn.aim) * 70)]], 4.2, L.INK_SOFT);
    disc(X(st.x), Y(q.y) - 11 * k, GLYPH[st.kind] || '?', 7.5);
  }
  for (const e of Ly.engines) { // an engine: a disc under its deck with a thrust arrow (the way it pushes); the brass dot at the tip is a handle to turn it (S.5h)
    const q = P[e.d];
    if (!q) continue;
    const { x, y } = engineArrow(v, o.aim && o.aim.name === e.name ? { ...e, dir: o.aim.dir } : e, q), cx = X(e.x), cy = Y(q.y) + 14 * k, sel = o.engine === e.name;
    if (e.swivel) { g.beginPath(); g.arc(cx, cy, 15 * k, 0, 6.2832); g.strokeStyle = L.INK_SOFT; g.lineWidth = 1.2 * k; g.setLineDash([3 * k, 3 * k]); g.stroke(); g.setLineDash([]); }
    if (sel) { g.beginPath(); g.arc(cx, cy, 17 * k, 0, 6.2832); g.fillStyle = 'rgba(201,168,90,0.35)'; g.fill(); }
    disc(cx, cy, 'E', 7.5, 'rgba(201,168,90,0.5)');
    arrow(cx, cy, x, y, L.STAMP);
    g.beginPath(); g.arc(x, y, (sel ? 5.5 : 4) * k, 0, 6.2832); g.fillStyle = L.PIN; g.fill(); g.strokeStyle = L.INK; g.lineWidth = 1.2 * k; g.stroke();
  }
  g.fillStyle = L.INK_SOFT;
  for (const r of [...Ly.racks, ...Ly.vents, ...Ly.extinguishers]) { const q = P[r.d]; if (q) g.fillRect(X(r.x) - 2 * k, Y(q.y) - 8 * k, 4 * k, 8 * k); }
  for (const gv of Ly.gasValves || []) { // gas valves: a wheel on the deck, a dotted line up to the bag it feeds
    const q = P[gv.d], bag = (Ly.gasbags || [])[gv.bag];
    if (!q) continue;
    if (bag) line([[X(gv.x), Y(q.y) - 14 * k], [X(bag.cx), Y(bag.cy + bag.ry * 0.5)]], 1.2, 'rgba(79,127,63,0.7)', [3, 4]);
    disc(X(gv.x), Y(q.y) - 12 * k, 'V', 6.5, 'rgba(111,160,122,0.7)');
  }
  if (Ly.medbay) { const q = P.find((d) => d.id === Ly.medbay.p); if (q) text('+', X(Ly.medbay.x), Y(q.y) - 4 * k, 16, L.STAMP, 'center', true); }
  for (const b of Ly.ballast || []) { // sandbags: a sack on the deck, or hanging under it on a rope
    const bx = X(b.x), by = Y(b.y);
    if (b.hang) line([[bx, Y(P[b.d].y)], [bx, by - 4 * k]], 1.2, L.INK_SOFT);
    g.beginPath(); g.ellipse(bx, b.hang ? by + 3 * k : by - 5 * k, 6 * k, 5 * k, 0, 0, 6.2832); g.fillStyle = 'rgba(183,154,99,0.85)'; g.fill();
    g.strokeStyle = L.INK; g.lineWidth = 1.2 * k; g.stroke();
  }
  // Balance: the centre of lift (a pennant on the bag) and the centre of mass (a weight), joined by the beam they pull on.
  const bal = o.balance;
  if (bal && bal.com && bal.col) {
    const cx = X(bal.col.x), cy = Y(bal.col.y), mx = X(bal.com.x), my = Y(bal.com.y);
    const col = bal.level === 'FAIL' ? L.STAMP : bal.level === 'WARN' ? '#c9892a' : '#4f7f3f';
    line([[cx, cy], [cx, my]], 1.2, 'rgba(107,74,50,0.5)', [4, 4]);
    line([[cx, my], [mx, my]], 2.2, col);
    g.beginPath(); g.moveTo(cx, cy - 8 * k); g.lineTo(cx + 9 * k, cy); g.lineTo(cx, cy + 8 * k); g.lineTo(cx - 9 * k, cy); g.closePath(); g.fillStyle = L.PAPER; g.fill(); g.strokeStyle = L.INK; g.lineWidth = 1.6 * k; g.stroke();
    text('LIFT', cx, cy - 12 * k, 9, L.INK_SOFT, 'center');
    g.beginPath(); g.arc(mx, my, 7 * k, 0, 6.2832); g.fillStyle = col; g.fill(); g.strokeStyle = L.INK; g.lineWidth = 1.6 * k; g.stroke();
    text(`WEIGHT  ${bal.deg === 0 ? 'level' : (bal.deg > 0 ? 'nose-heavy ' : 'tail-heavy ') + Math.abs(bal.deg) + '\u00b0'}`, mx, my + 20 * k, 10, col, 'center');
  }

  // The size of the ship, along the bottom and the right edge.
  if (Ly.bounds && !clean) {
    const B = Ly.bounds, yb = v.h - pad.b * k + 22 * k;
    line([[X(B.x0), yb], [X(B.x1), yb]], 1.2, L.INK_SOFT);
    for (const x of [B.x0, B.x1]) line([[X(x), yb - 4 * k], [X(x), yb + 4 * k]], 1.2, L.INK_SOFT);
    text(`${Math.round(B.x1 - B.x0)} px = ${((B.x1 - B.x0) / COL).toFixed(1)} columns long, ${Math.round(B.y1 - B.y0)} px tall`, X((B.x0 + B.x1) / 2), yb + 14 * k, 11, L.INK_SOFT, 'center');
  }

  // The key, on the empty paper to the right of the ship.
  const kx = X(W.x1) + 16 * k;
  if (!clean && v.w - kx > 200 * k) {
    const rows = ['PENCIL: drag along a deck row.', 'Along a deck it gets longer; on an', 'empty stretch it makes a new deck', '(rooms, hull and a ladder come too).', 'GASBAG: drag along the bag row (in', 'empty space = one more bag; drag a', 'bag end to resize it).', 'PARTS: drag a picture from the tray', 'onto the ship; it snaps to a spot.', 'LADDER: drag down from one deck to', 'another (a pole is one way, down).', 'ERASER: drag along a deck (it gets', 'shorter or goes, with what stood on', 'it). DELETE: click any one thing.', 'OUTDOOR / COVERED: under the pencil.', 'Open air has rails (weather, raiders,', 'overboard); covered has a roof.', 'ARMOUR: drag iron plate along a deck.', '', 'Lines snap to the column grid and', 'to deck ends.', '', 'H helm  B boiler  L lookout', 'C coal  A ammo  G gun  S lamp', 'Z coil  D deflector  M bomb bay', 'N navigator  F fighter  E engine', 'X swivel crank (red arrow = thrust,', 'brass dot = drag it to aim the engine)'];
    text('HOW TO', kx, pad.t * k + 16 * k, 14, L.INK, 'left', true);
    rows.forEach((t, i) => text(t, kx, pad.t * k + 36 * k + i * 15 * k, 11, i < rows.length - 6 ? L.INK_SOFT : L.INK));
  }

  // A part picture being dragged in from the tray (S.5d): everything it cannot go is dimmed, the legal spots stay bright, the picture snaps to the nearest one.
  //   o.drop = { slots: the legal slots, target: the slot it would drop on (or null), ptr: { x, y } the pointer in ship coordinates, img: the picture (canvas), why: why not (when no target) }
  const dr = o.drop;
  if (dr && typeof document !== 'undefined') {
    const BE = config.BUILD_EDIT;
    if (!drawBlueprint.veil) drawBlueprint.veil = document.createElement('canvas');
    const veil = drawBlueprint.veil;
    if (veil.width !== v.w || veil.height !== v.h) { veil.width = v.w; veil.height = v.h; }
    const vg = veil.getContext('2d');
    vg.setTransform(1, 0, 0, 1, 0, 0);
    vg.globalCompositeOperation = 'source-over';
    vg.clearRect(0, 0, v.w, v.h);
    vg.fillStyle = 'rgba(243,234,214,0.62)';
    vg.fillRect(0, 0, v.w, v.h);
    vg.globalCompositeOperation = 'destination-out';
    vg.fillStyle = '#000';
    for (const sl of dr.slots) { // the windows: bright strips where the part can go
      if (sl.bag) vg.fillRect(X(sl.span[0]), Y(BE.BAG_CY) - BE.BAG_RY * s - 8 * k, (sl.span[1] - sl.span[0]) * s, 2 * BE.BAG_RY * s + 16 * k);
      else if (sl.hr != null) vg.fillRect(X(sl.x) - 14 * k, Y(sl.hy) - sl.hr * s - 4 * k, 28 * k, 2 * sl.hr * s + 8 * k);
      else if (sl.hatch) vg.fillRect(X(sl.hatch[0]) - 14 * k, Y(sl.y) - 58 * k, (sl.hatch[1] - sl.hatch[0]) * s + 28 * k, 74 * k);
      else vg.fillRect(X(sl.x) - 24 * k, Y(sl.y) - 58 * k, 48 * k, 74 * k);
    }
    vg.globalCompositeOperation = 'source-over';
    g.drawImage(veil, 0, 0);
  }

  // Part slots (brass pins) when a part is picked from the palette.
  for (const sl of o.slots || []) {
    if (sl.bag) continue; // (a bag's slot is a stretch of the bag row, drawn as the bag it would make)
    const on = o.hover === sl, y = Y(sl.y) - 30 * k * 0.6;
    if (sl.hatch && on) hatchMark(X(sl.hatch[0]), X(sl.hatch[1]), Y(sl.y), X(sl.lever), true); // (a hatch pin shows the stretch of floor it would open, and its lever)
    g.beginPath(); g.arc(X(sl.x), y, (on ? 9 : 6) * k, 0, 6.2832);
    g.fillStyle = on ? '#ffe9a0' : L.PIN; g.fill();
    g.strokeStyle = L.INK; g.lineWidth = 1.8 * k; g.stroke();
  }
  if (o.hover && o.hover.bag && !dr) { // (click-a-part way) the bag the hovered stretch would make
    const t = o.hover;
    g.beginPath(); g.ellipse(X(t.x), Y(config.BUILD_EDIT.BAG_CY), ((t.span[1] - t.span[0]) / 2) * s, config.BUILD_EDIT.BAG_RY * s, 0, 0, 6.2832);
    g.strokeStyle = '#4f7f3f'; g.lineWidth = 3 * k; g.setLineDash([10 * k, 6 * k]); g.stroke(); g.setLineDash([]);
  }
  if (o.hover && o.hover.label && !dr) text(o.hover.label, X(o.hover.x), Y(o.hover.y) - 38 * k, 12, L.INK, 'center', true);

  if (dr) { // the picture itself: on the spot it would drop on, or (no legal spot near) the reason, by the pointer
    const BE = config.BUILD_EDIT, t = dr.target, size = 64 * k;
    const note = (txt, x, y, color) => {
      g.font = font(12, false);
      const tw = g.measureText(txt).width, tx = Math.max(pad.l * k, Math.min(v.w - tw - 14 * k, x - tw / 2)), ty = Math.max(24 * k, y);
      g.fillStyle = 'rgba(243,234,214,0.95)'; g.fillRect(tx - 6 * k, ty - 14 * k, tw + 12 * k, 20 * k);
      g.strokeStyle = color; g.lineWidth = 1.4 * k; g.strokeRect(tx - 6 * k, ty - 14 * k, tw + 12 * k, 20 * k);
      text(txt, tx, ty, 12, color);
    };
    if (t) {
      if (t.bag) { // the bag it would make, as a dashed envelope
        g.beginPath(); g.ellipse(X(t.x), Y(BE.BAG_CY), ((t.span[1] - t.span[0]) / 2) * s, BE.BAG_RY * s, 0, 0, 6.2832);
        g.fillStyle = 'rgba(79,127,63,0.14)'; g.fill();
        g.strokeStyle = '#4f7f3f'; g.lineWidth = 3 * k; g.setLineDash([10 * k, 6 * k]); g.stroke(); g.setLineDash([]);
        if (dr.img) g.drawImage(dr.img, X(t.x) - size / 2, Y(BE.BAG_CY) - size / 2, size, size);
        note(t.label, X(t.x), Y(BE.BAG_CY) - BE.BAG_RY * s - 10 * k, '#3b6b34');
      } else {
        if (t.hatch) hatchMark(X(t.hatch[0]), X(t.hatch[1]), Y(t.y), X(t.lever), true);
        const px = X(t.x), py = Y(t.hy != null ? t.hy : t.y) - (t.hy != null ? 0 : size * 0.5 + 4 * k);
        g.beginPath(); g.arc(px, py, size * 0.62, 0, 6.2832); g.fillStyle = 'rgba(255,233,160,0.45)'; g.fill(); g.strokeStyle = '#4f7f3f'; g.lineWidth = 2.4 * k; g.stroke();
        if (dr.img) g.drawImage(dr.img, px - size / 2, py - size / 2, size, size);
        note(t.label, px, py - size * 0.7, '#3b6b34');
      }
    } else if (dr.ptr && dr.why) note(dr.why, X(dr.ptr.x), Y(dr.ptr.y) - 40 * k, L.STAMP);
  }

  // The pen and eraser.
  if (o.cursor) { line([[X(o.cursor.x), Y(o.cursor.y) - 8 * k], [X(o.cursor.x), Y(o.cursor.y) + 8 * k]], 2, L.STAMP); line([[X(o.cursor.x) - 8 * k, Y(o.cursor.y)], [X(o.cursor.x) + 8 * k, Y(o.cursor.y)]], 2, L.STAMP); }
  if (o.target) { // the delete tool is over a thing: ring it
    const t = o.target;
    g.beginPath(); g.arc(X(t.x), Y(t.y), (t.r * 0.7 + 4) * s * 1.2 + 6 * k, 0, 6.2832);
    g.fillStyle = 'rgba(168,68,63,0.16)'; g.fill(); g.strokeStyle = L.STAMP; g.lineWidth = 2 * k; g.stroke();
    text('delete ' + t.label, X(t.x), Y(t.y) - 22 * k, 11, L.STAMP, 'center');
  }
  const gh = o.ghost;
  if (gh) {
    const y = gh.tool === 'bag' || gh.row === 'gasbag' ? Y(config.BUILD_EDIT.BAG_CY) : Y(DECK_ROWS[gh.row]), good = gh.ok;
    if (gh.tool === 'ladder') {
      const y1 = Y(DECK_ROWS[gh.row1]);
      line([[X(gh.x0), y], [X(gh.x0), y1]], 5, good ? '#4f7f3f' : L.STAMP, good ? (gh.type === 'pole' ? [3, 6] : null) : [10, 8]);
      for (const yy of [y, y1]) line([[X(gh.x0) - 10 * k, yy], [X(gh.x0) + 10 * k, yy]], 3, good ? '#4f7f3f' : L.STAMP);
      if (gh.label) text(gh.label, Math.min(v.w - 260 * k, X(gh.x0) + 14 * k), (y + y1) / 2, 12, good ? L.INK : L.STAMP);
    } else if (gh.tool === 'bag') {
      for (const b of gh.bags || []) { g.beginPath(); g.ellipse(X(b.cx), Y(b.cy), b.rx * s, b.ry * s, 0, 0, 6.2832); g.strokeStyle = good ? '#4f7f3f' : L.STAMP; g.lineWidth = 3 * k; g.setLineDash([10 * k, 6 * k]); g.stroke(); g.setLineDash([]); }
      line([[X(gh.x0), y], [X(gh.x1), y]], 5, good ? '#4f7f3f' : L.STAMP);
      if (gh.label) text(gh.label, Math.max(pad.l * k, X((gh.x0 + gh.x1) / 2) - 120 * k), y - 28 * k, 12, good ? L.INK : L.STAMP);
    } else if (gh.tool === 'erase') {
      const hh = gh.row === 'gasbag' ? config.BUILD_EDIT.BAG_RY * s : 26 * k; // (rubbing out a bag: a band as tall as the bag)
      g.fillStyle = good ? 'rgba(168,68,63,0.22)' : 'rgba(107,74,50,0.12)';
      g.fillRect(X(gh.x0), y - hh, (gh.x1 - gh.x0) * s, 2 * hh);
      for (let hx = gh.x0; hx < gh.x1; hx += 24) line([[X(hx), y + hh], [X(Math.min(gh.x1, hx + 14)), y - hh]], 1.4, good ? L.STAMP : L.INK_SOFT);
    } else if (gh.tool === 'armour') { // a band of plate on the wall / rail
      g.fillStyle = good ? 'rgba(58,44,32,0.45)' : 'rgba(168,68,63,0.2)';
      g.fillRect(X(gh.x0), y - 24 * k, (gh.x1 - gh.x0) * s, 48 * k);
      line([[X(gh.x0), y], [X(gh.x1), y]], 5, good ? '#4f7f3f' : L.STAMP, good ? null : [10, 8]);
    } else {
      line([[X(gh.x0), y], [X(gh.x1), y]], 7, good ? '#4f7f3f' : L.STAMP, good ? null : [10, 8]);
      for (const x of [gh.x0, gh.x1]) line([[X(x), y - 12 * k], [X(x), y + 12 * k]], 3, good ? '#4f7f3f' : L.STAMP);
      if (gh.tool === 'draw' && gh.cover) { // OUTDOOR (a rail over the line) or COVERED (a roof over it): what the stroke will draw
        if (gh.cover === 'outdoor') { line([[X(gh.x0), y - 24 * k], [X(gh.x1), y - 24 * k]], 2, good ? '#4f7f3f' : L.STAMP); for (let x = gh.x0; x <= gh.x1; x += 90) line([[X(x), y], [X(x), y - 24 * k]], 2, good ? '#4f7f3f' : L.STAMP); }
        else { g.strokeStyle = good ? '#4f7f3f' : L.STAMP; g.lineWidth = 2 * k; g.strokeRect(X(gh.x0), y - 40 * k, (gh.x1 - gh.x0) * s, 40 * k); }
      }
    }
    if (gh.label && gh.tool !== 'ladder' && gh.tool !== 'bag') {
      g.font = font(12, false);
      const tw = g.measureText(gh.label).width, tx = Math.max(pad.l * k, Math.min(v.w - tw - 14 * k, X((gh.x0 + gh.x1) / 2) - tw / 2)), ty = y - 36 * k;
      g.fillStyle = 'rgba(243,234,214,0.94)'; g.fillRect(tx - 6 * k, ty - 14 * k, tw + 12 * k, 20 * k);
      g.strokeStyle = good ? L.INK : L.STAMP; g.lineWidth = 1.4 * k; g.strokeRect(tx - 6 * k, ty - 14 * k, tw + 12 * k, 20 * k);
      text(gh.label, tx, ty, 12, good ? L.INK : L.STAMP);
    }
  }
  // The Yard's places (S.6b): a dashed ghost where the part would stand and a brass pin with its letter.
  for (const pn of o.pins || []) {
    const gh = pn.ghost;
    g.setLineDash([9 * k, 6 * k]);
    g.lineWidth = 2.6 * k;
    g.strokeStyle = '#4f7f3f';
    g.fillStyle = 'rgba(79,127,63,0.13)';
    if (gh && gh.ellipse) { g.beginPath(); g.ellipse(X(gh.cx), Y(gh.cy), gh.rx * s, gh.ry * s, 0, 0, 6.2832); g.fill(); g.stroke(); }
    else if (gh) { g.fillRect(X(gh.x0), Y(gh.y0), (gh.x1 - gh.x0) * s, (gh.y1 - gh.y0) * s); g.strokeRect(X(gh.x0), Y(gh.y0), (gh.x1 - gh.x0) * s, (gh.y1 - gh.y0) * s); }
    g.setLineDash([]);
    const px = X(pn.x), py = Y(pn.y) - (gh && gh.ellipse ? 0 : 46 * k);
    if (!(gh && gh.ellipse)) line([[px, py + 13 * k], [px, Y(pn.y) - 10 * k]], 1.8, L.INK_SOFT);
    g.beginPath(); g.arc(px, py, 15 * k, 0, 6.2832); g.fillStyle = L.PIN; g.fill(); g.strokeStyle = L.INK; g.lineWidth = 2.2 * k; g.stroke();
    text(pn.letter, px, py + 6 * k, 18, L.INK, 'center', true);
  }
  if (o.stamp) { // BUILT: a red stamp at the top right
    g.save();
    g.translate(v.w - 150 * k, 70 * k);
    g.rotate(-0.1);
    g.font = font(40, true);
    const tw = Math.max(g.measureText(o.stamp.text).width, o.stamp.sub ? (g.font = font(13, false), g.measureText(o.stamp.sub).width) : 0) + 30 * k;
    g.fillStyle = L.STAMP_BG; g.fillRect(-tw / 2, -34 * k, tw, o.stamp.sub ? 70 * k : 52 * k);
    g.strokeStyle = L.STAMP; g.lineWidth = 3.4 * k; g.strokeRect(-tw / 2, -34 * k, tw, o.stamp.sub ? 70 * k : 52 * k);
    g.textAlign = 'center'; g.fillStyle = L.STAMP; g.font = font(40, true); g.fillText(o.stamp.text, 0, 6 * k);
    if (o.stamp.sub) { g.font = font(13, false); g.fillText(o.stamp.sub, 0, 28 * k); }
    g.restore();
  }
  // Can she fly?
  if (o.status && !o.status.ok) {
    g.save();
    g.translate(v.w - pad.r * k - 6 * k, v.h - pad.b * k - 14 * k); // (bottom right, clear of the key)
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
