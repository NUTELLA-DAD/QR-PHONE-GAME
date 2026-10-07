// Draws the airship from SHIP_LAYOUT. Uses art from art/sprites/ship/ where it exists, and
// placeholder vector drawings everywhere else.
// Everything is in ship coordinates; render.js has already shifted for altitude.
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { drawBiplane, drawTailNumber } from './planeArt.js';
import { paintPath, paintRect } from './textureArt.js';
import { drawIceLocker, drawIceFlights, drawBoilerHeat, drawHoleGlow } from './goingDownArt.js';

// Which painted texture goes under which flat palette colour (anything not listed stays flat).
const TEX_OF = {
  '#ebdfc0': 'canvas', '#d6c7a2': 'canvas', '#cbbd96': 'canvas', '#c49a74': 'canvas',
  '#b98a5a': 'wood', '#8a6444': 'wood', '#a87b4f': 'wood', '#bf9567': 'wood', '#c9a05f': 'wood',
  '#6b4a32': 'darkwood', '#4a4346': 'charcoal',
  '#c9a85a': 'brass', '#6d7378': 'brass', '#9aa1a6': 'brass', '#8d969b': 'brass', '#6a6568': 'brass', '#5a5558': 'brass',
};

const L = SHIP_LAYOUT;
const P = L.platforms;
const INK = config.INK;
const WOOD = '#b98a5a';
const WOOD_DARK = '#6b4a32';
const IRON = '#6a6568';

export function createShipArt({ ctx, state, ink, rrect, sprites }) {
  let liftY = P[L.connectors.find((c) => c.type === 'lift').bottom].y;

  const line = (pts, width = 3.2, color = INK) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };

  const filled = (color, path) => {
    ink();
    ctx.fillStyle = color;
    ctx.beginPath();
    path();
    ctx.fill();
    const tx = TEX_OF[color];
    if (tx) paintPath(ctx, tx, tx === 'brass' ? 0.8 : 1);
    ctx.stroke();
  };

  // ---- Big pieces ----
  const gondolaPath = () => {
    ctx.moveTo(130, 480);
    ctx.lineTo(1430, 480);
    ctx.quadraticCurveTo(1512, 484, 1512, 600);
    ctx.quadraticCurveTo(1508, 650, 1470, 662);
    ctx.lineTo(1352, 815);
    ctx.lineTo(248, 815);
    ctx.lineTo(126, 662);
    ctx.closePath();
  };

  // Repeat a tile sprite along a row from x0 to x1 (tile drawn w wide, h tall, top at y).
  const tileRow = (key, x0, x1, y, w, h) => {
    if (!sprites.has(key)) return false;
    for (let x = x0; x < x1; x += w) sprites.box(ctx, key, x, y, Math.min(w, x1 - x + 1), h);
    return true;
  };

  const has = (id) => (state.upgrades || {})[id] || 0;

  const drawGasbag = () => {
    const G = L.gasbag;
    if (has('twin-gasbag')) {
      // The second envelope, riding higher behind the first, with its own rigging.
      const g2 = Math.max(0, Math.min(1, (state.ship.gas ?? 50) / 100));
      line([[520, 0], [520, -60]], 4);
      line([[1100, 0], [1100, -60]], 4);
      const r2x = (G.rx * 0.7) * (0.8 + 0.4 * g2);
      const r2y = G.ry * 0.62 * (0.9 + 0.2 * g2);
      if (sprites.has('ship/gasbag')) {
        // The same painted envelope, a little smaller, clipped to its ellipse, with a crisp outline on top.
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(780, -60, r2x, r2y, 0, 0, 7);
        ctx.clip();
        sprites.box(ctx, 'ship/gasbag', 780 - r2x, -60 - r2y, r2x * 2, r2y * 2);
        ctx.restore();
        ink();
        ctx.beginPath();
        ctx.ellipse(780, -60, r2x, r2y, 0, 0, 7);
        ctx.stroke();
      } else {
        filled('#d6c7a2', () => ctx.ellipse(780, -60, r2x, r2y, 0, 0, 7));
        ctx.lineWidth = 3;
        for (let i = -3; i <= 3; i++) {
          ctx.beginPath();
          ctx.ellipse(780, -60, (G.rx * 0.7 * Math.abs(i)) / 3.6 + 4, G.ry * 0.62, 0, i < 0 ? Math.PI - 1.57 : -1.57, i < 0 ? Math.PI + 1.57 : 1.57);
          ctx.stroke();
        }
      }
    }
    // The envelope swells when full and sags when empty (mostly in length, a little in height).
    const g = Math.max(0, Math.min(1, (state.ship.gas ?? 50) / 100));
    ctx.save();
    ctx.translate(G.cx, G.cy);
    ctx.scale(0.78 + 0.44 * g, 0.9 + 0.2 * g);
    ctx.translate(-G.cx, -G.cy);
    // Better Rudders: bigger fins.
    const fin = 1 + 0.25 * has('rudders');
    ctx.save();
    ctx.translate(-100, 198); // the stern of the bigger bag
    ctx.scale(fin, fin);
    ctx.translate(-40, -245);
    // Tail fins (behind the envelope, at the stern = left).
    if (!sprites.box(ctx, 'ship/fin-top', -95, 70, 135, 130)) {
      filled('#c49a74', () => {
        ctx.moveTo(40, 170);
        ctx.lineTo(-95, 70);
        ctx.lineTo(-80, 200);
        ctx.closePath();
      });
    }
    if (!sprites.box(ctx, 'ship/fin-bottom', -95, 290, 135, 130)) {
      filled('#c49a74', () => {
        ctx.moveTo(40, 320);
        ctx.lineTo(-95, 420);
        ctx.lineTo(-80, 290);
        ctx.closePath();
      });
    }
    ctx.restore();
    let painted = false;
    try {
      if (sprites.has('ship/gasbag')) {
        // Painted envelope, stretched to the ellipse's box and clipped to the ellipse, with the ink outline kept on top.
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(G.cx, G.cy, G.rx, G.ry, 0, 0, 7);
        ctx.clip();
        painted = sprites.box(ctx, 'ship/gasbag', G.cx - G.rx, G.cy - G.ry, G.rx * 2, G.ry * 2);
        ctx.restore();
        if (painted) {
          ink();
          ctx.beginPath();
          ctx.ellipse(G.cx, G.cy, G.rx, G.ry, 0, 0, 7);
          ctx.stroke();
          if (has('rubber-gasbag')) {
            // Rubberised: a darker wash over the canvas.
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(G.cx, G.cy, G.rx - 2, G.ry - 2, 0, 0, 7);
            ctx.clip();
            ctx.fillStyle = 'rgba(120,98,60,0.22)';
            ctx.fillRect(G.cx - G.rx, G.cy - G.ry, G.rx * 2, G.ry * 2);
            ctx.restore();
          }
        }
      }
    } catch (e) {
      ctx.restore();
      painted = false;
    }
    if (!painted) {
      // Rubberised Gasbag: darker rubber with patches.
      filled(has('rubber-gasbag') ? '#cbbd96' : '#ebdfc0', () => ctx.ellipse(G.cx, G.cy, G.rx, G.ry, 0, 0, 7));
      if (has('rubber-gasbag')) for (const [px, py] of [[300, 200], [620, 320], [1050, 170], [1350, 300]]) filled('#a89a72', () => ctx.roundRect(px, py, 60, 34, 8));
      // One soft highlight band along the top of the envelope.
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(G.cx, G.cy, G.rx - 3, G.ry - 3, 0, 0, 7);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,250,232,0.45)';
      ctx.beginPath();
      ctx.ellipse(G.cx - 20, G.cy - G.ry * 0.38, G.rx * 0.9, G.ry * 0.45, 0, 0, 7);
      ctx.fill();
      // ...and one soft shadow band along the belly (painted, flat, no gradient).
      ctx.fillStyle = 'rgba(120,96,70,0.2)';
      ctx.beginPath();
      ctx.ellipse(G.cx + 30, G.cy + G.ry * 0.78, G.rx * 0.95, G.ry * 0.42, 0, 0, 7);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(43,38,34,0.55)';
      ctx.lineWidth = 2;
      for (let i = -5; i <= 5; i++) {
        ctx.beginPath();
        const side = i < 0 ? Math.PI : 0;
        ctx.ellipse(G.cx, G.cy, (G.rx * Math.abs(i)) / 5.6 + 4, G.ry, 0, side - 1.57, side + 1.57);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(G.cx - G.rx, G.cy);
      ctx.lineTo(G.cx + G.rx, G.cy);
      ctx.stroke();
    }
    // Our crew's crest on the envelope.
    sprites.box(ctx, 'crests/crew', G.cx - 110, G.cy - 110, 220, 220);
    // Nearly empty: wrinkles.
    if (g < 0.35) {
      ctx.strokeStyle = 'rgba(80,60,40,.5)';
      ctx.lineWidth = 2.8;
      for (let k = 0; k < 7; k++) {
        const x = G.cx - G.rx * 0.8 + (k * G.rx * 1.6) / 6;
        ctx.beginPath();
        ctx.moveTo(x, G.cy - G.ry * 0.7);
        ctx.quadraticCurveTo(x + 25, G.cy, x - 10, G.cy + G.ry * 0.7);
        ctx.stroke();
      }
    }
    ctx.restore();
    // Rigging down to the gondola.
    for (const x of [260, 520, 800, 1080, 1340]) line([[x - 40, 400], [x, 480]], 3);
  };

  const drawNest = () => {
    ctx.save();
    ctx.translate(0, -L.nestRise); // drawn at its old height, then lifted onto the bigger bag
    drawNestParts();
    ctx.restore();
  };

  const drawNestParts = () => {
    line([[800, 8], [800, -60]], 5); // flag pole
    if (!sprites.box(ctx, 'crests/crew', 802, -64, 34, 34)) {
      ctx.fillStyle = '#a8443f';
      ctx.beginPath();
      ctx.moveTo(800, -60);
      ctx.lineTo(850, -48);
      ctx.lineTo(800, -36);
      ctx.fill();
    }
    if (has('periscope')) {
      // Periscope sticking up from the crow's nest.
      line([[720, 8], [720, -70], [748, -70]], 9, '#6a6568');
      filled('#bcd9e3', () => ctx.arc(752, -70, 7, 0, 7));
    }
    const n = P.find((q) => q.id === 'nest');
    if (sprites.box(ctx, 'ship/nest', n.x0, 6, n.x1 - n.x0, 80)) return;
    filled(WOOD, () => ctx.roundRect(n.x0, 52, n.x1 - n.x0, 34, 8));
    line([[n.x0, 8], [n.x1, 8]], 5);
    for (let x = n.x0 + 10; x <= n.x1 - 9; x += (n.x1 - n.x0 - 20) / 7) line([[x, 8], [x, 52]], 4);
  };

  const drawCatwalk = () => {
    const p = P.find((q) => q.id === 'catwalk');
    const y = p.y;
    const w = p.x1 - p.x0;
    if (!tileRow('ship/catwalk', p.x0, p.x1, y - 40, 140, 50)) {
      // Planked deck: boards with a pale highlight, and a dark toe beam along the edge.
      filled(WOOD, () => ctx.rect(p.x0, y, w, 14));
      ctx.fillStyle = 'rgba(255,246,214,.35)';
      ctx.fillRect(p.x0 + 3, y + 3, w - 6, 3);
      for (let x = p.x0 + 44; x < p.x1; x += 44) line([[x, y], [x, y + 14]], 2, WOOD_DARK);
      filled(WOOD_DARK, () => ctx.rect(p.x0 - 6, y + 14, w + 12, 8));
      // Railings (broken where a ladder or rope comes up through the deck): posts, a top rail and a rope.
      const gaps = L.connectors.filter((c) => P[c.top].id === 'catwalk' || P[c.bottom].id === 'catwalk').map((c) => (P[c.top].id === 'catwalk' ? c.xTop : c.xBottom));
      const open = (x) => gaps.some((g) => Math.abs(x - g) < 30);
      const rail = (x0, x1) => {
        line([[x0, y - 46], [x1, y - 46]], 5);
        line([[x0, y - 22], [x1, y - 22]], 3, '#a87b4f');
      };
      let from = p.x0;
      for (const g of [...gaps].sort((a, b) => a - b).concat([p.x1 + 40])) {
        const to = Math.min(g - 28, p.x1);
        if (to > from + 10) rail(from, to);
        from = g + 28;
      }
      for (let x = p.x0 + 4; x <= p.x1; x += 70) {
        if (open(x)) continue;
        line([[x, y], [x, y - 46]], 5);
        filled('#c9a85a', () => ctx.arc(x, y - 48, 4.5, 0, 7)); // brass cap
      }
    }
    // Fittings along the deck: lanterns on the rail, a stack of crates, barrels, a rope coil, a sign.
    for (const lx of [640, 1120]) {
      line([[lx, y - 46], [lx, y - 74]], 4);
      filled('#f2d36b', () => ctx.roundRect(lx - 7, y - 94, 14, 20, 4));
    }
    filled('#c9a05f', () => ctx.rect(450, y - 40, 44, 40));
    line([[450, y - 40], [494, y]], 2.5, WOOD_DARK);
    line([[494, y - 40], [450, y]], 2.5, WOOD_DARK);
    filled('#b98a5a', () => ctx.rect(462, y - 78, 36, 38));
    line([[462, y - 78], [498, y - 40]], 2.5, WOOD_DARK);
    for (const bx of [1128, 1166]) {
      filled('#8a6444', () => ctx.roundRect(bx - 16, y - 46, 32, 46, 8));
      line([[bx - 16, y - 32], [bx + 16, y - 32]], 3);
      line([[bx - 16, y - 14], [bx + 16, y - 14]], 3);
    }
    filled('#a87b4f', () => ctx.ellipse(400, y - 8, 22, 8, 0, 0, 7));
    filled('#bf9567', () => ctx.ellipse(400, y - 17, 18, 7, 0, 0, 7));
    line([[560, y - 48], [560, y - 70]], 3);
    line([[650, y - 48], [650, y - 70]], 3);
    filled('#f3ead6', () => ctx.roundRect(540, y - 100, 130, 30, 5));
    ctx.font = '17px ' + config.FONTS.DISPLAY;
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.fillText('TOP DECK', 605, y - 79);
    // Deck guns: a post from the deck up to the mount, a base plate and sandbags on the outer side.
    for (const [name, m] of Object.entries(L.gunMounts)) {
      const s = L.stations.find((q) => q.n === name);
      if (!s || P[s.d].id !== 'catwalk') continue;
      const out = Math.cos(m.aim) < 0 ? -1 : 1;
      line([[m.bx, m.by + 14], [m.bx, y]], 11);
      line([[m.bx, m.by + 14], [m.bx, y]], 6, IRON);
      filled(IRON, () => ctx.roundRect(m.bx - 20, y - 8, 40, 8, 3));
      for (const [dx, dy, r] of [[out * 34, -9, 17], [out * 56, -9, 15], [out * 44, -25, 15]]) {
        filled('#cdbd92', () => ctx.ellipse(m.bx + dx, y + dy, r, r * 0.55, 0, 0, 7));
      }
    }
  };

  // The helm: a ship's wheel on a little raised mount on the top deck, in the open. Whoever steers
  // is exposed to enemy fire (a hit close to them can knock them out).
  const drawHelmMount = () => {
    const hp = P.find((q) => q.id === 'helm');
    const cat = P.find((q) => q.id === 'catwalk');
    const st = L.stations.find((q) => q.n === 'Helm');
    const w = hp.x1 - hp.x0;
    // Trestle legs and cross brace down to the deck.
    for (const x of [hp.x0 + 8, hp.x1 - 8]) filled(WOOD_DARK, () => ctx.rect(x - 4, hp.y, 8, cat.y - hp.y));
    line([[hp.x0 + 8, hp.y + 8], [hp.x1 - 8, cat.y - 4]], 4, WOOD_DARK);
    line([[hp.x1 - 8, hp.y + 8], [hp.x0 + 8, cat.y - 4]], 4, WOOD_DARK);
    // Planked platform.
    filled(WOOD, () => ctx.rect(hp.x0 - 6, hp.y, w + 12, 12));
    ctx.fillStyle = 'rgba(255,246,214,.35)';
    ctx.fillRect(hp.x0 - 2, hp.y + 3, w + 4, 3);
    filled(WOOD_DARK, () => ctx.rect(hp.x0 - 6, hp.y + 12, w + 12, 6));
    // Rail on the open side (the ladder comes up at the left), with a pennant.
    line([[hp.x1, hp.y], [hp.x1, hp.y - 46]], 5);
    line([[hp.x0 + 52, hp.y - 46], [hp.x1, hp.y - 46]], 5);
    line([[hp.x0 + 52, hp.y], [hp.x0 + 52, hp.y - 46]], 5);
    line([[hp.x0 + 52, hp.y - 22], [hp.x1, hp.y - 22]], 3, '#a87b4f');
    line([[hp.x1, hp.y - 46], [hp.x1, hp.y - 130]], 4);
    filled('#8fb37a', () => {
      ctx.moveTo(hp.x1, hp.y - 130);
      ctx.lineTo(hp.x1 - 44, hp.y - 118);
      ctx.lineTo(hp.x1, hp.y - 104);
      ctx.closePath();
    });
    // Compass binnacle.
    filled(WOOD_DARK, () => ctx.rect(hp.x0 + 78, hp.y - 28, 16, 28));
    filled('#c9a85a', () => ctx.arc(hp.x0 + 86, hp.y - 34, 12, Math.PI, 0));
    // The wheel on its pedestal (turning with the ship's speed).
    filled(WOOD_DARK, () => ctx.roundRect(st.x - 13, hp.y - 44, 26, 44, 4));
    const wy = hp.y - 70;
    if (!sprites.pivot(ctx, 'ship/wheel', st.x, wy, 0.5, 0.5, state.ship.speed * 6)) {
      ctx.save();
      ctx.translate(st.x, wy);
      ctx.rotate(state.ship.speed * 6);
      ink();
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, 7);
      ctx.stroke();
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        line([[0, 0], [Math.cos(a) * 38, Math.sin(a) * 38]], 4, WOOD);
      }
      ctx.restore();
    }
    // Hit warning: red flash over the helm and HELMSMAN HIT!
    const H = config.HELM_EXPOSED;
    if (state.helmHit > 0) {
      const t = Math.min(1, state.helmHit / H.WARN_TIME);
      ctx.fillStyle = `rgba(230,57,70,${0.4 * t})`;
      ctx.beginPath();
      ctx.arc(st.x, hp.y - 55, 70, 0, 7);
      ctx.fill();
      ctx.strokeStyle = `rgba(230,57,70,${0.9 * t})`;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.font = '23px ' + config.FONTS.DISPLAY;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#fff';
      ctx.strokeText('HELMSMAN HIT!', st.x, hp.y - 150);
      ctx.fillStyle = '#c0282f';
      ctx.fillText('HELMSMAN HIT!', st.x, hp.y - 150);
    }
  };

  // Room back walls: a picture per room if drawn, else flat colour.
  const ROOM_ART = { 'Tail Turret': 'tail-turret', 'Boiler Room': 'boiler', Workshop: 'workshop', Bridge: 'bridge', 'Aft Gun Deck': 'aft-gun-deck', Hold: 'hold', 'Fore Gun Deck': 'fore-gun-deck' };

  const drawGondola = () => {
    const shell = sprites.has('ship/gondola');
    if (!shell) filled('#8a6444', gondolaPath);
    ctx.save();
    ctx.beginPath();
    gondolaPath();
    ctx.clip();
    for (const r of L.rooms) {
      if (r.outside || r.p === 'bay') continue; // (the bomb bay compartment is drawn by drawBombBay)
      const y = P[r.d].y;
      const h = P[r.d].id === 'lower' ? 140 : 148;
      if (!sprites.box(ctx, 'ship/room-' + ROOM_ART[r.name], r.x0, y - h, r.x1 - r.x0, h)) {
        ctx.fillStyle = r.color;
        ctx.fillRect(r.x0 + 3, y - 148, r.x1 - r.x0 - 6, 148);
        paintRect(ctx, 'darkwood', r.x0 + 3, y - 148, r.x1 - r.x0 - 6, 148, 0.9);
        // Header beam above each doorway between rooms.
        ctx.fillStyle = WOOD_DARK;
        ctx.fillRect(r.x0 - 4, y - 148, 8, 34);
      }
    }
    // Floors.
    for (const id of ['main', 'lower']) {
      const p = P.find((q) => q.id === id);
      if (!tileRow('ship/floor', p.x0 - 20, p.x1 + 20, p.y, 128, 12)) {
        ctx.fillStyle = WOOD_DARK;
        ctx.fillRect(p.x0 - 20, p.y, p.x1 - p.x0 + 40, 12);
        paintRect(ctx, 'wood', p.x0 - 20, p.y, p.x1 - p.x0 + 40, 12);
      }
    }
    ctx.restore();
    // The hull shell art (with see-through rooms) goes over the room walls.
    if (sprites.box(ctx, 'ship/gondola', 126, 480, 1386, 335)) return;
    ink();
    ctx.beginPath();
    gondolaPath();
    ctx.stroke();
    // Bridge windows.
    for (const x of [1150, 1250, 1350]) {
      filled('#bcd9e3', () => ctx.roundRect(x, 500, 80, 56, 10));
      line([[x + 18, 512], [x + 40, 540]], 3, '#ffffff');
    }
    // Portholes along the lower deck.
    for (const x of [310, 560, 1010, 1260]) {
      if (!sprites.box(ctx, 'ship/porthole', x - 16, 674, 32, 32)) filled('#bcd9e3', () => ctx.arc(x, 690, 16, 0, 7));
    }
  };

  const drawOutriggers = (time) => {
    for (const r of L.rooms.filter((q) => q.outside)) {
      const y = P[r.d].y;
      const inner = r.x0 < 800 ? r.x1 : r.x0;
      // Struts back to the hull.
      line([[r.x0 < 800 ? r.x0 + 20 : r.x1 - 20, y + 10], [inner, y + 40]], 6);
      if (tileRow('ship/outrigger', r.x0, r.x1, y - 40, 140, 50)) continue;
      for (let x = r.x0; x <= r.x1; x += 58) line([[x, y], [x, y - 40]], 4);
      line([[r.x0, y - 40], [r.x1, y - 40]], 4);
      filled(WOOD, () => ctx.rect(r.x0, y, r.x1 - r.x0, 10));
    }
    for (const e of L.engines) {
      const y = P[e.d].y + 38;
      const out = e.x < 800 ? -1 : 1;
      if (!sprites.box(ctx, 'ship/engine', e.x - 62, y - 24, 124, 48, out < 0)) {
        filled('#6d7378', () => ctx.ellipse(e.x, y, 62, 24, 0, 0, 7));
        filled(IRON, () => ctx.arc(e.x + out * 62, y, 9, 0, 7));
      }
      // Spinning propeller seen edge-on.
      const spin = Math.cos(time * 30) * 46;
      filled('#6b4a32', () => ctx.ellipse(e.x + out * 70, y, 6, Math.abs(spin) + 4, 0, 0, 7));
    }
  };

  const drawPod = () => {
    if (!sprites.box(ctx, 'ship/pod', 723, 822, 144, 116)) {
      filled('#8a6444', () => ctx.ellipse(795, 880, 72, 58, 0, 0, 7));
      filled('#bcd9e3', () => ctx.arc(830, 880, 22, 0, 7));
    }
    ctx.fillStyle = WOOD_DARK;
    ctx.fillRect(735, P.find((q) => q.id === 'pod').y, 120, 8);
  };

  // The fighter hatch under the hull, and the escort fighter hanging on its hook when she's home
  // (a ghostly outline while a new one is being built).
  const drawHangar = (time) => {
    const docks = L.escortDocks || [{ p: 'hangar', num: 1, x: L.escortDock.x, y: L.escortDock.y }];
    docks.forEach((dock, i) => {
      const hp = P.find((q) => q.id === dock.p);
      if (!hp) return;
      ctx.fillStyle = WOOD_DARK;
      ctx.fillRect(hp.x0, hp.y, hp.x1 - hp.x0, 8);
      const esc = (state.escorts || [state.escort])[i];
      if (!esc || esc.flying) return;
      line([[dock.x, hp.y + 8], [dock.x, dock.y - 32]], 5, INK);
      ctx.save();
      ctx.translate(dock.x, dock.y);
      ctx.scale(1.45, 1.45);
      if (esc.rebuild > 0) ctx.globalAlpha = 0.35;
      drawBiplane(ctx, 0, '#8fb37a', '#e8d8a8', false, '#c8372d');
      drawTailNumber(ctx, dock.num || i + 1);
      ctx.restore();
    });
  };

  // ---- Fittings ----
  const drawPipes = () => {
    for (const pipe of L.pipes) {
      line(pipe.points, 13, INK);
      line(pipe.points, 7, '#9aa1a6');
      const [vx, vy] = pipe.valve;
      const m = moduleFor(pipe.to + ' Pipe');
      const open = !m || m.open;
      if (sprites.box(ctx, 'ship/valve', vx - 14, vy - 14, 28, 28)) {
        // Small lamp shows open (green) or closed (red).
        ctx.fillStyle = open ? '#6fa07a' : '#a8443f';
        ctx.beginPath();
        ctx.arc(vx + 16, vy - 14, 6, 0, 7);
        ctx.fill();
        continue;
      }
      ink();
      ctx.lineWidth = 3;
      ctx.fillStyle = open ? '#6fa07a' : '#a8443f'; // green = open, red = closed
      ctx.beginPath();
      ctx.arc(vx, vy, 14, 0, 7);
      ctx.fill();
      ctx.stroke();
      line([[vx - 14, vy], [vx + 14, vy]], 3);
      line([[vx, vy - 14], [vx, vy + 14]], 3);
    }
  };

  const drawRacks = () => {
    for (const r of L.racks) {
      if (r.kind === 'ice') continue; // (the ice locker is drawn by goingDownArt.js)
      const y = P[r.d].y - 115;
      if (sprites.box(ctx, 'ship/rack-' + r.kind, r.x - 34, y, 68, 70)) continue;
      filled(WOOD, () => ctx.roundRect(r.x - 34, y, 68, 70, 6));
      if (r.kind === 'hookshot') {
        // The harpoon-gun (same shape as the one a crew member carries) resting on two pegs.
        try {
          for (const px of [-18, 8]) line([[r.x + px, y + 40], [r.x + px, y + 52]], 4, WOOD_DARK);
          ctx.save();
          ctx.translate(r.x - 14, y + 30);
          ctx.scale(0.75, 0.75);
          const poly = (pts, fill) =>
            filled(fill, () => {
              pts.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)));
              ctx.closePath();
            });
          filled('#d6bf8a', () => ctx.ellipse(16, 8, 8, 6, 0, 0, Math.PI * 2)); // rope coil
          poly([[-19, -3], [-5, -7], [8, -7], [8, 2], [1, 4], [-4, 13], [-12, 13], [-10, 3], [-19, 3]], '#9a6a3e');
          poly([[8, -9], [38, -9], [38, -1], [8, -1]], '#c9a54a');
          poly([[17, -10], [20, -10], [20, 0], [17, 0]], '#8a6a2a');
          poly([[36, -11], [42, -12], [42, 2], [36, 1]], '#a8863a');
          line([[42, -5], [50, -5]], 4.6);
          for (const [ex, ey] of [[58, -14], [61, -5], [58, 4]]) {
            ctx.strokeStyle = INK;
            ctx.lineWidth = 4.6;
            ctx.beginPath();
            ctx.moveTo(50, -5);
            ctx.quadraticCurveTo(55, ey, ex, ey * 0.8 - 1);
            ctx.stroke();
            ctx.strokeStyle = '#8a8588';
            ctx.lineWidth = 2.4;
            ctx.stroke();
          }
          ctx.restore();
        } catch (e) {
          try { ctx.restore(); } catch (e2) {}
        }
        continue;
      }
      for (const dx of [-14, 14]) {
        if (r.kind === 'sword') {
          line([[r.x + dx, y + 8], [r.x + dx, y + 58]], 5, '#d8dde0');
          line([[r.x + dx - 9, y + 48], [r.x + dx + 9, y + 48]], 4, INK);
        } else {
          line([[r.x + dx, y + 20], [r.x + dx, y + 62]], 5, '#7a4a24');
          filled(IRON, () => ctx.rect(r.x + dx - 10, y + 8, 20, 14));
        }
      }
    }
  };

  const drawExtinguishers = () => {
    for (const e of L.extinguishers) {
      const y = P[e.d].y - 80;
      if (sprites.box(ctx, 'ship/extinguisher', e.x - 12, y - 10, 24, 60)) continue;
      filled('#a8443f', () => ctx.roundRect(e.x - 10, y, 20, 44, 8));
      line([[e.x, y], [e.x + 10, y - 10]], 4);
    }
  };

  // A ladder made of repeating rung tiles (32 wide, 26 tall), from top to bottom.
  const ladderTiles = (key, x, top, bottom) => {
    if (!sprites.has(key)) return false;
    for (let y = top; y < bottom; y += 26) sprites.box(ctx, key, x - 16, y, 32, Math.min(26, bottom - y));
    return true;
  };

  const drawConnectors = () => {
    L.connectors.forEach((c, i) => {
      const yTop = P[c.top].y;
      const yBot = P[c.bottom].y;
      if (c.type === 'ladder' || c.type === 'rope') {
        const top = c.type === 'rope' ? yTop : yTop - 40;
        if (ladderTiles(c.type === 'rope' ? 'ship/rope-ladder' : 'ship/ladder', c.xTop, top, yBot)) return;
        const color = c.type === 'rope' ? '#a87b4f' : INK;
        line([[c.xTop - 14, top], [c.xTop - 14, yBot]], 4, color);
        line([[c.xTop + 14, top], [c.xTop + 14, yBot]], 4, color);
        for (let y = top + 18; y < yBot; y += 26) line([[c.xTop - 14, y], [c.xTop + 14, y]], 4, color);
      } else if (c.type === 'pole') {
        // Slide pole: a brass pole with a handrail ring at the top (one-way, down only).
        line([[c.xTop, yTop - 70], [c.xTop, yBot]], 9, INK);
        line([[c.xTop, yTop - 70], [c.xTop, yBot]], 5, '#d9a93c');
        line([[c.xTop - 1.5, yTop - 66], [c.xTop - 1.5, yBot]], 1.6, '#fff0b0');
        line([[c.xTop - 16, yTop - 70], [c.xTop + 16, yTop - 70]], 5, INK);
        line([[c.xTop - 15, yTop - 70], [c.xTop + 15, yTop - 70]], 2.5, '#d9a93c');
      } else if (c.type === 'stairs') {
        if (sprites.box(ctx, 'ship/stairs', c.xTop - 30, yTop - 50, c.xBottom - c.xTop + 60, yBot - yTop + 50)) return;
        line([[c.xTop - 10, yTop], [c.xBottom - 10, yBot]], 6);
        const steps = 7;
        for (let k = 1; k <= steps; k++) {
          const t = k / steps;
          const x = c.xTop + (c.xBottom - c.xTop) * t;
          const y = yTop + (yBot - yTop) * t;
          line([[x - 26, y], [x + 6, y]], 5);
        }
        line([[c.xTop + 20, yTop - 50], [c.xBottom + 20, yBot - 50]], 4); // handrail
      } else if (c.type === 'lift') {
        // Shaft rails and a cage that follows whoever is riding it.
        line([[c.xTop - 40, yTop - 150], [c.xTop - 40, yBot]], 4);
        line([[c.xTop + 40, yTop - 150], [c.xTop + 40, yBot]], 4);
        const rider = [...Object.values(state.players), ...state.boarders].find((w) => w.conn === i);
        if (rider) liftY = rider.y;
        line([[c.xTop, yTop - 150], [c.xTop, liftY - 128]], 3);
        if (sprites.box(ctx, 'ship/lift', c.xTop - 38, liftY - 128, 76, 132)) return;
        ink();
        ctx.lineWidth = 2.8;
        ctx.strokeRect(c.xTop - 38, liftY - 128, 76, 128);
        ctx.fillStyle = IRON;
        ctx.fillRect(c.xTop - 38, liftY - 4, 76, 10);
      }
    });
  };

  const drawProps = (time) => {
    // Boiler with glowing firebox and pressure gauge.
    const boiler = L.stations.find((s) => s.n === 'Boiler');
    const by = P[boiler.d].y;
    const glow = 0.5 + 0.5 * Math.sin(time * 6);
    const fuel = Math.min(1, (state.ship.fuel || 0) / 40);
    if (sprites.box(ctx, 'ship/boiler', boiler.x - 70, by - 112, 90, 112)) {
      // Fire glow over the firebox door.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,${100 + glow * 60},30,${0.15 + 0.45 * fuel})`;
      ctx.fillRect(boiler.x - 50, by - 48, 50, 30);
      ctx.restore();
    } else {
      // Big Firebox: a wider boiler.
      const wide = 18 * has('firebox');
      filled('#5a5558', () => ctx.roundRect(boiler.x - 70 - wide, by - 112, 90 + wide, 112, 16));
      ctx.fillStyle = fuel > 0 ? `rgba(255,${120 + glow * 80},40,${0.3 + 0.7 * fuel})` : '#3a3538';
      ctx.fillRect(boiler.x - 50, by - 48, 50, 30);
    }
    const gx = boiler.x + 60;
    const gy = by - 90;
    const angle = -Math.PI * 1.15 + (state.ship.press / 100) * Math.PI * 1.3;
    if (!sprites.box(ctx, 'ship/gauge', gx - 28, gy - 28, 56, 56)) filled('#f1e2b8', () => ctx.arc(gx, gy, 28, 0, 7));
    line([[gx, gy], [gx + Math.cos(angle) * 22, gy + Math.sin(angle) * 22]], 5, state.ship.press < config.BOILER.WARN_AT ? '#6fa07a' : '#a8443f');

    // (The ship's wheel is drawn by drawHelmMount, out on the top deck.)

    // Chart table for the navigator.
    const nav = L.stations.find((s) => s.n === 'Navigator');
    if (!sprites.box(ctx, 'ship/chart-table', nav.x - 40, P[nav.d].y - 52, 80, 52)) {
      filled('#e9dcb5', () => ctx.rect(nav.x - 40, P[nav.d].y - 52, 80, 12));
      line([[nav.x - 30, P[nav.d].y - 40], [nav.x - 30, P[nav.d].y]], 5);
      line([[nav.x + 30, P[nav.d].y - 40], [nav.x + 30, P[nav.d].y]], 5);
    }

    // Ammo crates in the hold.
    const hold = L.stations.find((s) => s.n === 'Ammo Hold');
    const hy2 = P[hold.d].y;
    if (!sprites.box(ctx, 'ship/ammo-crates', hold.x + 20, hy2 - 50, 100, 50)) {
      [[30, 0], [64, 0], [47, -26]].forEach(([x, y]) => filled('#c9a05f', () => ctx.rect(hold.x + x, hy2 - 24 + y, 34, 24)));
    }
  };

  const moduleFor = (name) => (state.modules || []).find((m) => m.name === name);

  // Health bars on damaged modules, smoke on broken ones, steam jets from burst pipes.
  const drawModuleStatus = (time) => {
    for (const m of state.modules || []) {
      const { x, y } = m.pos;
      if (m.broken) {
        const leaking = m.kind === 'pipe' && m.open;
        for (let k = 0; k < 3; k++) {
          const t = (time * 0.8 + k / 3) % 1;
          ctx.fillStyle = leaking ? `rgba(255,255,255,${0.8 - t * 0.8})` : `rgba(60,60,60,${0.7 - t * 0.7})`;
          ctx.beginPath();
          ctx.arc(x + Math.sin(time * 3 + k) * 10 + (leaking ? t * 40 : 0), y - 20 - t * 70, 10 + t * 18, 0, 7);
          ctx.fill();
        }
        ctx.font = '20px ' + config.FONTS.DISPLAY;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#fff';
        ctx.strokeText('BROKEN', x, y - 34);
        ctx.fillStyle = '#a8443f';
        ctx.fillText('BROKEN', x, y - 34);
      }
      if (m.hp < m.max) {
        const w = 60;
        ctx.fillStyle = '#6b4a32';
        ctx.fillRect(x - w / 2, y - 26, w, 9);
        ctx.fillStyle = m.hp > 50 ? '#9cc99a' : m.hp > 0 ? '#f4a261' : '#a8443f';
        ctx.fillRect(x - w / 2, y - 26, (w * m.hp) / m.max, 9);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - w / 2, y - 26, w, 9);
      }
    }
  };

  // Gasbag holes: torn patches with gas wisping out.
  const drawGasHoles = (time) => {
    for (const h of state.gasHoles || []) {
      if (h.gd) drawHoleGlow(ctx, h, time); // GOING DOWN!: the leaks that must be patched glow
      if (!sprites.box(ctx, 'fx/gas-hole', h.x - 20, h.y - 15, 40, 30)) {
        ink();
        ctx.lineWidth = 3;
        ctx.fillStyle = '#6b4a32';
        ctx.beginPath();
        ctx.moveTo(h.x - 16, h.y - 8);
        ctx.lineTo(h.x - 4, h.y - 14);
        ctx.lineTo(h.x + 14, h.y - 6);
        ctx.lineTo(h.x + 10, h.y + 10);
        ctx.lineTo(h.x - 12, h.y + 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      for (let k = 0; k < 3; k++) {
        const t = (time * 1.2 + k / 3) % 1;
        ctx.fillStyle = `rgba(225,240,220,${0.8 - t * 0.8})`;
        ctx.beginPath();
        ctx.arc(h.x + Math.sin(time * 4 + k) * 8, h.y - 14 - t * 50, 7 + t * 14, 0, 7);
        ctx.fill();
      }
      if (h.prog > 0) {
        ctx.fillStyle = '#6b4a32';
        ctx.fillRect(h.x - 24, h.y + 16, 48, 8);
        ctx.fillStyle = '#9cc99a';
        ctx.fillRect(h.x - 24, h.y + 16, 48 * Math.min(1, h.prog), 8);
      }
    }
  };

  // Steam vent stacks: open ones blow a big plume (handle turned); closed ones hiss a little
  // when the pressure is high.
  const drawVents = (time) => {
    const high = state.ship.press >= config.BOILER.WARN_AT;
    L.vents.forEach((v, i) => {
      const y = P[v.d].y;
      const open = state.ventOpen && state.ventOpen[i];
      if (!sprites.box(ctx, 'ship/vent', v.x - 16, y - 150, 32, 110)) {
        filled('#9aa1a6', () => ctx.rect(v.x - 9, y - 140, 18, 100));
        filled('#6d7378', () => ctx.rect(v.x - 16, y - 150, 32, 14));
        filled(open ? '#4caf50' : high ? '#a8443f' : '#a8443f', () => ctx.arc(v.x, y - 60, 13, 0, 7));
        if (open) line([[v.x, y - 73], [v.x, y - 47]], 3);
        else line([[v.x - 13, y - 60], [v.x + 13, y - 60]], 3);
      }
      const puffs = open ? 5 : high ? 2 : 0;
      for (let k = 0; k < puffs; k++) {
        const t = (time * (open ? 2.2 : 1.5) + k / puffs) % 1;
        ctx.fillStyle = `rgba(255,255,255,${(open ? 0.85 : 0.7) - t * 0.7})`;
        ctx.beginPath();
        ctx.arc(v.x + (open ? Math.sin(k * 2.1) * t * 20 : 0), y - 160 - t * (open ? 110 : 40), (open ? 12 : 8) + t * (open ? 22 : 12), 0, 7);
        ctx.fill();
      }
    });
  };

  // Coal bunker: a bin with a coal heap.
  const drawCoal = () => {
    const s = L.stations.find((q) => q.n === 'Coal Bunker');
    if (!s) return;
    const y = P[s.d].y;
    if (sprites.box(ctx, 'ship/coal-bunker', s.x - 50, y - 86, 100, 86)) return;
    filled(WOOD, () => ctx.rect(s.x - 50, y - 46, 100, 46));
    filled('#3a3538', () => {
      ctx.moveTo(s.x - 44, y - 44);
      ctx.quadraticCurveTo(s.x - 10, y - 86, s.x + 44, y - 44);
      ctx.closePath();
    });
  };

  const drawLabels = () => {
    ctx.font = '700 24px ' + config.FONTS.TEXT;
    ctx.textAlign = 'center';
    const placed = [];
    for (const s of [...L.stations].sort((a, b) => a.x - b.x)) {
      const y = P[s.d].y;
      ctx.fillStyle = 'rgba(27,20,16,.2)';
      rrect(s.x - 50, y - 6, 100, 8, 4);
      ctx.fill();
      const w = ctx.measureText(s.n).width + 20;
      const id = P[s.d].id;
      let ly = id === 'nest' ? y - 100 : id === 'pod' || id === 'hangar' || id === 'bay' || id === 'lamp' ? y - 20 : y - 134;
      const lx = id === 'pod' || id === 'hangar' ? s.x + 130 : id === 'lamp' ? s.x + 125 : id === 'bay' ? s.x - 25 : s.x;
      // Drop a label one row if it would overlap its neighbour.
      while (placed.some((o) => Math.abs(o.ly - ly) < 30 && Math.abs(o.lx - lx) < (o.w + w) / 2 + 6)) ly += 36;
      placed.push({ lx, ly, w });
      ctx.fillStyle = '#f1e2b8';
      ink();
      ctx.lineWidth = 3;
      rrect(lx - w / 2, ly, w, 32, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.fillText(s.n, lx, ly + 24);
    }
  };

  // Upgrade fittings: armour plates, sprinklers, the safety-valve whistle.
  const drawUpgradeFittings = () => {
    const armour = has('armour');
    for (let k = 0; k < armour; k++) {
      // Riveted steel plates along the hull's lower edge.
      for (let x = 270; x < 1330; x += 90) {
        filled('#8d969b', () => ctx.rect(x, 770 - k * 22, 80, 20));
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(x + 8, 780 - k * 22, 2.5, 0, 7);
        ctx.arc(x + 72, 780 - k * 22, 2.5, 0, 7);
        ctx.fill();
      }
    }
    if (has('sprinklers')) {
      for (const id of ['main', 'lower']) {
        const p = P.find((q) => q.id === id);
        const top = p.y - (id === 'lower' ? 138 : 146);
        for (let x = p.x0 + 120; x < p.x1 - 60; x += 220) {
          line([[x, top], [x, top + 12]], 4, '#9aa1a6');
          filled('#a8443f', () => ctx.arc(x, top + 15, 5, 0, 7));
        }
      }
    }
    if (has('safety-valve')) {
      const b = L.stations.find((s) => s.n === 'Boiler');
      const y = P[b.d].y - 112;
      line([[b.x - 30, y], [b.x - 30, y - 22]], 6, '#c9a85a');
      filled('#c9a85a', () => ctx.roundRect(b.x - 38, y - 34, 16, 14, 4));
    }
  };

  // Bomb bay: a rack of bombs inside and two doors in the belly that swing open on a drop.
  // Hazard stripes (red and cream, slanted) in a box.
  const hazard = (x0, y0, w, h) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, w, h);
    ctx.clip();
    ctx.fillStyle = '#ebdfc0';
    ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = '#a8443f';
    for (let x = x0 - h; x < x0 + w; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, y0 + h);
      ctx.lineTo(x + 12, y0 + h);
      ctx.lineTo(x + 12 + h, y0);
      ctx.lineTo(x + h, y0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ink();
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x0, y0, w, h);
  };

  // One bomb lying on a shelf, nose to the right.
  const drawBomb = (x, y) => {
    filled('#4a4346', () => ctx.ellipse(x, y, 17, 9, 0, 0, 7));
    filled('#a8443f', () => ctx.rect(x - 3, y - 9, 7, 18));
    filled('#6a6568', () => {
      ctx.moveTo(x - 14, y);
      ctx.lineTo(x - 24, y - 9);
      ctx.lineTo(x - 24, y + 9);
      ctx.closePath();
    });
  };

  // The bomb bay: its own dark compartment in the belly of the hull, reached by a hatch ladder from
  // the lower deck. Racks of bombs (they empty as bombs are dropped), a bombsight, an ammo point
  // where crates are brought to load bombs, and doors in the floor that swing open on a drop or a jump.
  const drawBombBay = () => {
    const B = L.bombBay;
    const bay = state.bombBay || { bombs: 0 };
    const bp = P.find((q) => q.id === 'bay');
    const fy = bp.y; // floor
    const x0 = bp.x0;
    const x1 = bp.x1;
    const top = 812;
    const half = B.doorHalf;
    const open = Math.min(1, (bay.open || 0) * 3);
    const manned = Object.values(state.players).some((q) => q.lock === 'Bomb Bay');
    // Hull blister: dark metal with chamfered bottom corners.
    filled('#4a4346', () => {
      ctx.moveTo(x0, top);
      ctx.lineTo(x0, fy - 8);
      ctx.lineTo(x0 + 22, fy + 18);
      ctx.lineTo(x1 - 22, fy + 18);
      ctx.lineTo(x1, fy - 8);
      ctx.lineTo(x1, top);
      ctx.closePath();
    });
    // Back wall, panelled, with rivets.
    ctx.fillStyle = '#5f585d';
    ctx.fillRect(x0 + 6, top + 12, x1 - x0 - 12, fy - top - 12);
    paintRect(ctx, 'charcoal', x0 + 6, top + 12, x1 - x0 - 12, fy - top - 12);
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.fillRect(x0 + 6, top + 12, x1 - x0 - 12, 10);
    for (let x = x0 + 46; x < x1 - 20; x += 62) line([[x, top + 14], [x, fy]], 2, '#3d373b');
    ctx.fillStyle = INK;
    for (let x = x0 + 16; x < x1 - 10; x += 31) {
      ctx.beginPath();
      ctx.arc(x, top + 20, 2, 0, 7);
      ctx.fill();
    }
    // Red warning stripes along the ceiling and the floor edge.
    hazard(x0 + 6, top + 12, x1 - x0 - 12, 12);
    hazard(x0 + 6, fy - 12, B.x - half - x0 - 6, 12);
    hazard(B.x + half, fy - 12, x1 - B.x - half - 6, 12);
    // Hatch up to the lower deck (the ladder is drawn with the other connectors).
    filled('#3d373b', () => ctx.rect(372 - 24, top + 8, 48, 8));
    // Stencilled name on the wall.
    ctx.font = '20px ' + config.FONTS.DISPLAY;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8c9c4';
    ctx.fillText('BOMB BAY', (x0 + x1) / 2 - 20, top + 52);
    // Bomb rack: a shelving frame with two shelves of three bombs; it empties as bombs are used.
    const rx0 = 400;
    const rx1 = 508;
    line([[rx0 - 4, top + 66], [rx0 - 4, fy]], 6, '#3d373b');
    line([[rx1, top + 66], [rx1, fy]], 6, '#3d373b');
    for (const sy of [fy - 30, fy - 68]) filled('#6b4a32', () => ctx.rect(rx0 - 8, sy, rx1 - rx0 + 14, 7));
    const shown = Math.min(bay.bombs, 6);
    for (let i = 0; i < shown; i++) drawBomb(rx0 + 28 + (i % 3) * 38, (i < 3 ? fy - 30 : fy - 68) - 10);
    ctx.font = '16px ' + config.FONTS.DISPLAY;
    ctx.fillStyle = bay.bombs > 0 ? '#f2d36b' : '#e8887f';
    ctx.fillText(bay.bombs > 0 ? 'BOMBS x' + bay.bombs : 'EMPTY', (rx0 + rx1) / 2, fy - 86);
    // Ammo point: crates stacked by the wall; bring an ammo crate to the bombardier to load bombs.
    filled('#c9a05f', () => ctx.rect(x1 - 52, fy - 34, 36, 34));
    line([[x1 - 52, fy - 34], [x1 - 16, fy]], 2.5, WOOD_DARK);
    filled('#b98a5a', () => ctx.rect(x1 - 44, fy - 66, 30, 32));
    ctx.font = '12px ' + config.FONTS.DISPLAY;
    ctx.fillStyle = INK;
    ctx.fillText('AMMO', x1 - 29, fy - 45);
    // Bombsight on a stand beside the bombardier, looking down through the doors.
    const sx = 536;
    line([[sx, fy], [sx, fy - 54]], 6, IRON);
    line([[sx, fy - 54], [sx + 22, fy - 28]], 11, INK);
    line([[sx, fy - 54], [sx + 22, fy - 28]], 7, '#c9a85a');
    filled(manned ? '#ff6a5c' : '#9a5a55', () => ctx.arc(sx + 24, fy - 26, 6, 0, 7));
    filled('#c9a85a', () => ctx.roundRect(sx - 10, fy - 62, 20, 12, 3));
    // Door slot in the floor: dark opening when the doors are open, leaves hinged at both sides.
    if (open > 0.02) {
      filled('#1d2630', () => ctx.rect(B.x - half, fy, half * 2, 17));
    }
    const a = open * 1.2;
    ctx.save();
    ctx.translate(B.x - half, fy);
    ctx.rotate(a);
    filled('#8a6444', () => ctx.rect(0, 0, half, 12));
    hazard(2, 1, half - 4, 6);
    ctx.restore();
    ctx.save();
    ctx.translate(B.x + half, fy);
    ctx.rotate(-a);
    filled('#8a6444', () => ctx.rect(-half, 0, half, 12));
    hazard(-half + 2, 1, half - 4, 6);
    ctx.restore();
    // JUMP sign over the doors (parachute!).
    ctx.font = '14px ' + config.FONTS.DISPLAY;
    ctx.fillStyle = '#f2d36b';
    ctx.fillText('JUMP', B.jumpX, fy - 74);
    ctx.fillStyle = '#f2d36b';
    ctx.beginPath();
    ctx.moveTo(B.jumpX - 9, fy - 66);
    ctx.lineTo(B.jumpX + 9, fy - 66);
    ctx.lineTo(B.jumpX, fy - 52);
    ctx.closePath();
    ctx.fill();
  };

  return (time) => {
    drawGasbag();
    drawNest();
    drawGondola();
    drawUpgradeFittings();
    drawOutriggers(time);
    drawPod();
    drawHangar(time);
    drawPipes();
    drawRacks();
    drawExtinguishers();
    drawProps(time);
    drawIceLocker(ctx, state, time);
    drawCoal();
    drawBombBay();
    drawHelmMount();
    // Medical bay sign (where anyone who falls off comes round).
    {
      const mb = L.medbay;
      const y = P.find((q) => q.id === mb.p).y - 120;
      filled('#f3ead6', () => ctx.roundRect(mb.x - 28, y - 28, 56, 56, 8));
      ctx.fillStyle = '#a8443f';
      ctx.fillRect(mb.x - 8, y - 20, 16, 40);
      ctx.fillRect(mb.x - 20, y - 8, 40, 16);
    }
    drawVents(time);
    drawConnectors();
    drawCatwalk();
    if (state.phase === 'lobby') drawLabels(); // (in flight each phone says where you are)
    drawGasHoles(time);
    drawModuleStatus(time);
    drawBoilerHeat(ctx, state, time); // GOING DOWN!: the boiler's heat bar and the ice blocks in flight
    drawIceFlights(ctx, state);
  };
}
