// Draws the airship from SHIP_LAYOUT. Uses art from art/sprites/ship/ where it exists, and
// placeholder vector drawings everywhere else.
// Everything is in ship coordinates; render.js has already shifted for altitude.
//
// Phase S.4: the ship is drawn PER PART, from the layout (platform spans, rooms, connectors, racks, mounts ...) so a longer
// deck or a second gasbag lines up by itself. The classic ship's hand-tuned shapes are reproduced exactly from the same
// layout numbers (see hullGeom / the offsets in each drawer).
//
// Two layers:
//   STATIC - hull shell, rails, ladders, pipes, racks, walls, stencils, the gasbag picture: things that never move. Drawn once
//            into offscreen canvases ("the bake", in ship space; BACK = behind the live bits, FRONT = ladders and the top deck
//            in front of them, plus one picture per gasbag) and blitted every frame under the ship's own tilt/bob transform,
//            only the non-empty tiles of each. Re-baked when the layout version, the perf level (textures on/off), loaded
//            sprites/textures/fonts, the ship's upgrades or the camera zoom (by more than config.SHIP_ART.BAKE_ZOOM) change.
//   LIVE   - gasbag swell and wrinkles, propellers, lift cage, doors, valve lamps, gauges, fire glow, bombs, vents' steam,
//            helm wheel, escort fighters, lobby name boards, holes, damage and status.
// Debug: window.shipProfile = {} adds the ms per part of the ship each frame (forces a flush each step).
// config.SHIP_ART.OFF = true draws everything directly (the old way).
// Drawing never throws: the bake falls back to drawing the static layer straight onto the screen.
import { config } from '../../config.js';
import { SHIP_LAYOUT, onLayoutChange, one, all, kindOf } from '../../shipLayout.js';
import { drawBiplane, drawTailNumber } from './planeArt.js';
import { paintPath, paintRect, hasTexture } from './textureArt.js';
import { drawIceLocker, drawIceFlights, drawBoilerHeat, drawHoleGlow } from './goingDownArt.js';

// Which painted texture goes under which flat palette colour (anything not listed stays flat).
const TEX_OF = {
  '#ebdfc0': 'canvas', '#d6c7a2': 'canvas', '#cbbd96': 'canvas', '#c49a74': 'canvas',
  '#b98a5a': 'wood', '#8a6444': 'wood', '#a87b4f': 'wood', '#bf9567': 'wood', '#c9a05f': 'wood',
  '#6b4a32': 'darkwood', '#4a4346': 'charcoal',
  '#c9a85a': 'brass', '#6d7378': 'brass', '#9aa1a6': 'brass', '#8d969b': 'brass', '#6a6568': 'brass', '#5a5558': 'brass',
};

// Sprites the STATIC layer may use: when one finishes loading, the bake is redone.
const STATIC_SPRITES = [
  'ship/nest', 'ship/gasbag', 'ship/fin-top', 'ship/fin-bottom', 'ship/catwalk', 'ship/gondola', 'ship/floor', 'ship/porthole', 'ship/outrigger', 'ship/engine', 'ship/pod',
  'ship/valve', 'ship/extinguisher', 'ship/ladder', 'ship/rope-ladder', 'ship/stairs', 'ship/lift', 'ship/boiler', 'ship/gauge',
  'ship/chart-table', 'ship/ammo-crates', 'ship/vent', 'ship/coal-bunker', 'crests/crew',
  'ship/room-tail-turret', 'ship/room-boiler', 'ship/room-workshop', 'ship/room-bridge', 'ship/room-aft-gun-deck', 'ship/room-hold', 'ship/room-fore-gun-deck',
  'ship/rack-sword', 'ship/rack-hammer', 'ship/rack-hookshot',
];
const STATIC_TEXTURES = ['canvas', 'wood', 'darkwood', 'charcoal', 'brass'];
const STATIC_UPGRADES = ['armour', 'sprinklers', 'safety-valve', 'firebox', 'periscope', 'rudders', 'rubber-gasbag', 'twin-gasbag'];
const ART = () => config.SHIP_ART || {};
const bakeSS = () => Math.max(0.5, Math.min(3, Number(ART().BAKE_SS) || 1.5)); // the bake is drawn at this many times the screen's own pixel density
const BAKE_MAX = 4096; // largest side of the baked canvas (px)

const L = SHIP_LAYOUT;
const P = L.platforms;
const INK = config.INK;
const WOOD = '#b98a5a';
const WOOD_DARK = '#6b4a32';
const IRON = '#6a6568';

export function createShipArt({ ctx: screenCtx, state, sprites }) {
  // `ctx` is whatever we are drawing onto right now: the screen, or the offscreen canvas while baking.
  let ctx = screenCtx;
  const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
  const plat = (id) => P.find((q) => q.id === id);
  const station = (name) => L.stations.find((q) => q.n === name);

  // (the cage of each lift rests at the bottom of its shaft until somebody rides it)
  const liftHome = (c) => num(P[c.bottom] && P[c.bottom].y);
  const liftYs = new Map();
  onLayoutChange(() => { liftYs.clear(); });

  // The same pen as render.js's ink(), but for whichever canvas we are drawing on.
  const ink = () => {
    ctx.strokeStyle = config.INK;
    ctx.lineWidth = config.OUTLINE.MAIN;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  };
  const rrect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  };

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

  // ---- Layout-derived geometry ----
  // The gondola hull outline, from the main and top decks' spans (the classic ship: 130..1512 across, 480..815 down).
  const hullGeom = () => {
    const main = plat('main');
    const lower = plat('lower');
    const cat = plat('catwalk');
    const top = cat.y + 10;
    return {
      xL: main.x0 - 10, xL2: main.x0 - 14, xR: main.x1 + 42, xNose: main.x1, xTopR: main.x1 - 40,
      xKeelL: main.x0 + 108, xKeelR: main.x1 - 118,
      top, yShoulder: main.y - 40, yTuck: main.y + 10, yTuck2: main.y + 22, yKeel: lower.y + 25,
    };
  };

  const gondolaPath = () => {
    const h = hullGeom();
    ctx.moveTo(h.xL, h.top);
    ctx.lineTo(h.xTopR, h.top);
    ctx.quadraticCurveTo(h.xR, h.top + 4, h.xR, h.yShoulder);
    ctx.quadraticCurveTo(h.xR - 4, h.yTuck, h.xNose, h.yTuck2);
    ctx.lineTo(h.xKeelR, h.yKeel);
    ctx.lineTo(h.xKeelL, h.yKeel);
    ctx.lineTo(h.xL2, h.yTuck2);
    ctx.closePath();
  };

  // Repeat a tile sprite along a row from x0 to x1 (tile drawn w wide, h tall, top at y).
  const tileRow = (key, x0, x1, y, w, h) => {
    if (!sprites.has(key)) return false;
    for (let x = x0; x < x1; x += w) sprites.box(ctx, key, x, y, Math.min(w, x1 - x + 1), h);
    return true;
  };

  const has = (id) => (state.upgrades || {})[id] || 0;

  // ================= GASBAGS (they swell with the gas) =================
  // The envelope's picture (tail fins, painted or drawn envelope, crest) never changes except with upgrades, so it is baked once
  // (see rebake) and drawn each frame under the swell scale; only the wrinkles and the rigging are drawn live.
  const bags = () => (Array.isArray(L.gasbag) ? L.gasbag : [L.gasbag]).filter((b) => b && Number.isFinite(b.rx) && b.rx > 0 && b.ry > 0);
  const gasFill = () => Math.max(0, Math.min(1, (state.ship.gas ?? 50) / 100));

  // The ship-space box a bag's picture is painted in (room on the left for the tail fins), and the twin envelope's.
  const bagRect = (G) => ({ x: Math.floor(G.cx - G.rx - 220), y: Math.floor(G.cy - G.ry - 50), w: Math.ceil(G.rx * 2 + 250), h: Math.ceil(G.ry * 2 + 100) });
  const twinGeom = (G) => ({ tx: G.cx - 20, ty: G.cy - 258, rx: G.rx * 0.7, ry: G.ry * 0.62 });
  const twinRect = (G) => { const t = twinGeom(G); return { x: Math.floor(t.tx - t.rx - 20), y: Math.floor(t.ty - t.ry - 20), w: Math.ceil(t.rx * 2 + 40), h: Math.ceil(t.ry * 2 + 40) }; };

  // Draw a baked (or directly painted) picture swollen about (cx, cy).
  const swollen = (cx, cy, sx, sy, baked, paint) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sx, sy);
    ctx.translate(-cx, -cy);
    if (baked) drawPic(baked);
    else paint();
    ctx.restore();
  };

  const drawGasbag = () => {
    const list = bags();
    const g = gasFill();
    list.forEach((G, bi) => {
      const first = bi === 0;
      if (first && has('twin-gasbag')) {
        // The second envelope, riding higher behind the first, with its own rigging.
        const t = twinGeom(G);
        line([[G.cx - 280, G.cy - 198], [G.cx - 280, t.ty]], 4);
        line([[G.cx + 300, G.cy - 198], [G.cx + 300, t.ty]], 4);
        swollen(t.tx, t.ty, 0.8 + 0.4 * g, 0.9 + 0.2 * g, bake.twin, () => paintTwin(G));
      }
      // The envelope swells when full and sags when empty (mostly in length, a little in height).
      swollen(G.cx, G.cy, 0.78 + 0.44 * g, 0.9 + 0.2 * g, bake.bags[bi], () => paintBag(G, first));
      // Nearly empty: wrinkles.
      if (g < 0.35) {
        ctx.save();
        ctx.translate(G.cx, G.cy);
        ctx.scale(0.78 + 0.44 * g, 0.9 + 0.2 * g);
        ctx.translate(-G.cx, -G.cy);
        ctx.strokeStyle = 'rgba(80,60,40,.5)';
        ctx.lineWidth = 2.8;
        for (let k = 0; k < 7; k++) {
          const x = G.cx - G.rx * 0.8 + (k * G.rx * 1.6) / 6;
          ctx.beginPath();
          ctx.moveTo(x, G.cy - G.ry * 0.7);
          ctx.quadraticCurveTo(x + 25, G.cy, x - 10, G.cy + G.ry * 0.7);
          ctx.stroke();
        }
        ctx.restore();
      }
    });
    // Rigging down to the gondola (from each bag, along its length).
    const yBot = plat('catwalk').y + 10;
    for (const G of list) for (const f of [-0.54, -0.28, 0, 0.28, 0.54]) {
      const x = G.cx + Math.round(f * G.rx);
      line([[x - 40, yBot - 80], [x, yBot]], 3);
    }
  };

  // The second (twin) envelope at its resting size.
  const paintTwin = (G) => {
    const { tx, ty, rx, ry } = twinGeom(G);
    if (sprites.has('ship/gasbag')) {
      // The same painted envelope, a little smaller, clipped to its ellipse, with a crisp outline on top.
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(tx, ty, rx, ry, 0, 0, 7);
      ctx.clip();
      sprites.box(ctx, 'ship/gasbag', tx - rx, ty - ry, rx * 2, ry * 2);
      ctx.restore();
      ink();
      ctx.beginPath();
      ctx.ellipse(tx, ty, rx, ry, 0, 0, 7);
      ctx.stroke();
    } else {
      filled('#d6c7a2', () => ctx.ellipse(tx, ty, rx, ry, 0, 0, 7));
      ctx.lineWidth = 3;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.ellipse(tx, ty, (G.rx * 0.7 * Math.abs(i)) / 3.6 + 4, G.ry * 0.62, 0, i < 0 ? Math.PI - 1.57 : -1.57, i < 0 ? Math.PI + 1.57 : 1.57);
        ctx.stroke();
      }
    }
  };

  // One gasbag at its resting size: tail fins (the first bag only), the envelope, our crew's crest.
  const paintBag = (G, first) => {
    if (first) {
      // Better Rudders: bigger fins.
      const fin = 1 + 0.25 * has('rudders');
      ctx.save();
      ctx.translate(G.cx - G.rx + 200, G.cy - 198); // (the classic bag's stern is at -200, 198)
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
    }
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
      painted = false;
    }
    if (!painted) {
      // Rubberised Gasbag: darker rubber with patches.
      filled(has('rubber-gasbag') ? '#cbbd96' : '#ebdfc0', () => ctx.ellipse(G.cx, G.cy, G.rx, G.ry, 0, 0, 7));
      if (has('rubber-gasbag')) for (const [px, py] of [[-500, 2], [-180, 122], [250, -28], [550, 102]]) filled('#a89a72', () => ctx.roundRect(G.cx + px, G.cy + py, 60, 34, 8));
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
  };

  // ================= CROW'S NEST (static) =================
  const drawNest = () => {
    ctx.save();
    ctx.translate(0, -num(L.nestRise)); // drawn at its old height, then lifted onto the bigger bag
    drawNestParts();
    ctx.restore();
  };

  const drawNestParts = () => {
    const n = plat('nest');
    if (!n) return;
    const mid = (n.x0 + n.x1) / 2;
    line([[mid, 8], [mid, -60]], 5); // flag pole
    if (!sprites.box(ctx, 'crests/crew', mid + 2, -64, 34, 34)) {
      ctx.fillStyle = '#a8443f';
      ctx.beginPath();
      ctx.moveTo(mid, -60);
      ctx.lineTo(mid + 50, -48);
      ctx.lineTo(mid, -36);
      ctx.fill();
    }
    if (has('periscope')) {
      // Periscope sticking up from the crow's nest.
      const px = n.x0 + 110;
      line([[px, 8], [px, -70], [px + 28, -70]], 9, '#6a6568');
      filled('#bcd9e3', () => ctx.arc(px + 32, -70, 7, 0, 7));
    }
    if (sprites.box(ctx, 'ship/nest', n.x0, 6, n.x1 - n.x0, 80)) return;
    filled(WOOD, () => ctx.roundRect(n.x0, 52, n.x1 - n.x0, 34, 8));
    line([[n.x0, 8], [n.x1, 8]], 5);
    for (let x = n.x0 + 10; x <= n.x1 - 9; x += (n.x1 - n.x0 - 20) / 7) line([[x, 8], [x, 52]], 4);
  };

  // ================= TOP DECK (static) =================
  const drawCatwalk = () => {
    const p = plat('catwalk');
    if (!p) return;
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
    // (Aft ones are measured from the deck's aft end, fore ones from its fore end; a short deck skips them.)
    if (w >= 800) {
      const a = p.x0;
      const f = p.x1;
      for (const lx of [a + 400, f - 240]) {
        line([[lx, y - 46], [lx, y - 74]], 4);
        filled('#f2d36b', () => ctx.roundRect(lx - 7, y - 94, 14, 20, 4));
      }
      filled('#c9a05f', () => ctx.rect(a + 210, y - 40, 44, 40));
      line([[a + 210, y - 40], [a + 254, y]], 2.5, WOOD_DARK);
      line([[a + 254, y - 40], [a + 210, y]], 2.5, WOOD_DARK);
      filled('#b98a5a', () => ctx.rect(a + 222, y - 78, 36, 38));
      line([[a + 222, y - 78], [a + 258, y - 40]], 2.5, WOOD_DARK);
      for (const bx of [f - 232, f - 194]) {
        filled('#8a6444', () => ctx.roundRect(bx - 16, y - 46, 32, 46, 8));
        line([[bx - 16, y - 32], [bx + 16, y - 32]], 3);
        line([[bx - 16, y - 14], [bx + 16, y - 14]], 3);
      }
      filled('#a87b4f', () => ctx.ellipse(a + 160, y - 8, 22, 8, 0, 0, 7));
      filled('#bf9567', () => ctx.ellipse(a + 160, y - 17, 18, 7, 0, 0, 7));
      line([[a + 320, y - 48], [a + 320, y - 70]], 3);
      line([[a + 410, y - 48], [a + 410, y - 70]], 3);
      filled('#f3ead6', () => ctx.roundRect(a + 300, y - 100, 130, 30, 5));
      ctx.font = '17px ' + config.FONTS.DISPLAY;
      ctx.textAlign = 'center';
      ctx.fillStyle = INK;
      ctx.fillText('TOP DECK', a + 365, y - 79);
    }
    // Deck guns: a post from the deck up to the mount, a base plate and sandbags on the outer side.
    for (const [name, m] of Object.entries(L.gunMounts)) {
      const s = station(name);
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

  // ================= HELM MOUNT =================
  // A ship's wheel on a little raised mount on the top deck, in the open. Whoever steers
  // is exposed to enemy fire (a hit close to them can knock them out).
  const drawHelmMount = () => {
    const hp = plat('helm');
    const cat = plat('catwalk');
    const st = one('helm');
    if (!hp || !cat || !st) return;
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
    // The pedestal the wheel turns on.
    filled(WOOD_DARK, () => ctx.roundRect(st.x - 13, hp.y - 44, 26, 44, 4));
  };

  // The wheel (turning with the ship's speed) and the hit warning: red flash over the helm and HELMSMAN HIT!
  const liveHelm = () => {
    const hp = plat('helm');
    const st = one('helm');
    if (!hp || !st) return;
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

  // ================= GONDOLA (static) =================
  // Room back walls: a picture per room if drawn, else flat colour.
  const ROOM_ART = { 'Tail Turret': 'tail-turret', 'Boiler Room': 'boiler', Workshop: 'workshop', Bridge: 'bridge', 'Aft Gun Deck': 'aft-gun-deck', Hold: 'hold', 'Fore Gun Deck': 'fore-gun-deck' };

  const drawGondola = () => {
    const H = hullGeom();
    const shell = sprites.has('ship/gondola');
    if (!shell) filled('#8a6444', gondolaPath);
    ctx.save();
    ctx.beginPath();
    gondolaPath();
    ctx.clip();
    const floors = [];
    for (const r of L.rooms) {
      if (r.outside || r.p === 'bay') continue; // (the bomb bay compartment is drawn by drawBombBay)
      const y = P[r.d].y;
      const h = P[r.d].id === 'lower' ? 140 : 148;
      if (!floors.includes(r.p)) floors.push(r.p);
      if (!sprites.box(ctx, 'ship/room-' + ROOM_ART[r.name], r.x0, y - h, r.x1 - r.x0, h)) {
        ctx.fillStyle = r.color || '#b08250';
        ctx.fillRect(r.x0 + 3, y - 148, r.x1 - r.x0 - 6, 148);
        paintRect(ctx, 'darkwood', r.x0 + 3, y - 148, r.x1 - r.x0 - 6, 148, 0.9);
        // Header beam above each doorway between rooms.
        ctx.fillStyle = WOOD_DARK;
        ctx.fillRect(r.x0 - 4, y - 148, 8, 34);
      }
    }
    // Floors (every deck that has rooms in the hull).
    for (const id of floors) {
      const p = plat(id);
      if (!p) continue;
      if (!tileRow('ship/floor', p.x0 - 20, p.x1 + 20, p.y, 128, 12)) {
        ctx.fillStyle = WOOD_DARK;
        ctx.fillRect(p.x0 - 20, p.y, p.x1 - p.x0 + 40, 12);
        paintRect(ctx, 'wood', p.x0 - 20, p.y, p.x1 - p.x0 + 40, 12);
      }
    }
    ctx.restore();
    // The hull shell art (with see-through rooms) goes over the room walls.
    if (sprites.box(ctx, 'ship/gondola', H.xL2, H.top, H.xR - H.xL2, H.yKeel - H.top)) return;
    ink();
    ctx.beginPath();
    gondolaPath();
    ctx.stroke();
    // Bridge windows.
    for (const dx of [-320, -220, -120]) {
      const x = H.xNose + dx;
      filled('#bcd9e3', () => ctx.roundRect(x, H.top + 20, 80, 56, 10));
      line([[x + 18, H.top + 32], [x + 40, H.top + 60]], 3, '#ffffff');
    }
    // Portholes along the lower deck.
    const main = plat('main');
    for (const dx of [170, 420, 870, 1120]) {
      const x = main.x0 + dx;
      if (x > main.x1 - 40) continue;
      if (!sprites.box(ctx, 'ship/porthole', x - 16, main.y + 34, 32, 32)) filled('#bcd9e3', () => ctx.arc(x, main.y + 50, 16, 0, 7));
    }
  };

  // ================= OUTRIGGERS & ENGINES =================
  const midX = () => { const q = plat('lower') || plat('main'); return (q.x0 + q.x1) / 2; };

  const drawOutriggers = () => {
    const mid = midX();
    for (const r of L.rooms.filter((q) => q.outside)) {
      const y = P[r.d].y;
      const inner = r.x0 < mid ? r.x1 : r.x0;
      // Struts back to the hull.
      line([[r.x0 < mid ? r.x0 + 20 : r.x1 - 20, y + 10], [inner, y + 40]], 6);
      if (tileRow('ship/outrigger', r.x0, r.x1, y - 40, 140, 50)) continue;
      for (let x = r.x0; x <= r.x1; x += 58) line([[x, y], [x, y - 40]], 4);
      line([[r.x0, y - 40], [r.x1, y - 40]], 4);
      filled(WOOD, () => ctx.rect(r.x0, y, r.x1 - r.x0, 10));
    }
    for (const e of L.engines) {
      const y = P[e.d].y + 38;
      const out = e.x < mid ? -1 : 1;
      if (!sprites.box(ctx, 'ship/engine', e.x - 62, y - 24, 124, 48, out < 0)) {
        filled('#6d7378', () => ctx.ellipse(e.x, y, 62, 24, 0, 0, 7));
        filled(IRON, () => ctx.arc(e.x + out * 62, y, 9, 0, 7));
      }
    }
  };

  // Spinning propellers seen edge-on.
  const liveEngines = (time) => {
    const mid = midX();
    for (const e of L.engines) {
      const y = P[e.d].y + 38;
      const out = e.x < mid ? -1 : 1;
      const spin = Math.cos(time * 30) * 46;
      filled('#6b4a32', () => ctx.ellipse(e.x + out * 70, y, 6, Math.abs(spin) + 4, 0, 0, 7));
    }
  };

  // ================= BALL TURRET POD (static) =================
  const drawPod = () => {
    for (const pp of P.filter((q) => /^pod/.test(q.id))) {
      const w = pp.x1 - pp.x0;
      const mid = (pp.x0 + pp.x1) / 2;
      if (!sprites.box(ctx, 'ship/pod', pp.x0 - 12, pp.y - 83, w + 24, 116)) {
        filled('#8a6444', () => ctx.ellipse(mid, pp.y - 25, w / 2 + 12, 58, 0, 0, 7));
        filled('#bcd9e3', () => ctx.arc(mid + 35, pp.y - 25, 22, 0, 7));
      }
      ctx.fillStyle = WOOD_DARK;
      ctx.fillRect(pp.x0, pp.y, w, 8);
    }
  };

  // ================= ESCORT HANGARS =================
  const docksOf = () => L.escortDocks || [{ p: 'hangar', num: 1, x: L.escortDock.x, y: L.escortDock.y }];

  // The fighter hatch under the hull (static)...
  const drawHangar = () => {
    for (const dock of docksOf()) {
      const hp = plat(dock.p);
      if (!hp) continue;
      ctx.fillStyle = WOOD_DARK;
      ctx.fillRect(hp.x0, hp.y, hp.x1 - hp.x0, 8);
    }
  };

  // ...and the escort fighter hanging on its hook when she's home (a ghostly outline while a new one is being built).
  const liveHangar = () => {
    docksOf().forEach((dock, i) => {
      const hp = plat(dock.p);
      if (!hp) return;
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

  // ================= PIPES, RACKS, EXTINGUISHERS =================
  const moduleFor = (name) => (state.modules || []).find((m) => m.name === name);

  const drawPipes = () => {
    for (const pipe of L.pipes) {
      line(pipe.points, 13, INK);
      line(pipe.points, 7, '#9aa1a6');
    }
  };

  // The valves with their open (green) / closed (red) lamps.
  const livePipes = () => {
    for (const pipe of L.pipes) {
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

  // ================= CONNECTORS (ladders, ropes, poles, stairs, lift shafts) =================
  // A ladder made of repeating rung tiles (32 wide, 26 tall), from top to bottom.
  const ladderTiles = (key, x, top, bottom) => {
    if (!sprites.has(key)) return false;
    for (let y = top; y < bottom; y += 26) sprites.box(ctx, key, x - 16, y, 32, Math.min(26, bottom - y));
    return true;
  };

  const drawConnectors = () => {
    L.connectors.forEach((c) => {
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
        // Shaft rails (the cage is live).
        line([[c.xTop - 40, yTop - 150], [c.xTop - 40, yBot]], 4);
        line([[c.xTop + 40, yTop - 150], [c.xTop + 40, yBot]], 4);
      }
    });
  };

  // The lift cage follows whoever is riding it.
  const liveConnectors = () => {
    L.connectors.forEach((c, i) => {
      if (c.type !== 'lift') return;
      const yTop = P[c.top].y;
      let liftY = liftYs.has(i) ? liftYs.get(i) : liftHome(c);
      const rider = [...Object.values(state.players), ...state.boarders].find((w) => w.conn === i);
      if (rider) liftY = rider.y;
      liftYs.set(i, liftY);
      line([[c.xTop, yTop - 150], [c.xTop, liftY - 128]], 3);
      if (sprites.box(ctx, 'ship/lift', c.xTop - 38, liftY - 128, 76, 132)) return;
      ink();
      ctx.lineWidth = 2.8;
      ctx.strokeRect(c.xTop - 38, liftY - 128, 76, 128);
      ctx.fillStyle = IRON;
      ctx.fillRect(c.xTop - 38, liftY - 4, 76, 10);
    });
  };

  // ================= STATION PROPS =================
  const drawProps = () => {
    // Boiler (the firebox glow and the gauge needle are live).
    for (const boiler of all('boiler')) {
      const by = P[boiler.d].y;
      if (!sprites.has('ship/boiler')) {
        // Big Firebox: a wider boiler.
        const wide = 18 * has('firebox');
        filled('#5a5558', () => ctx.roundRect(boiler.x - 70 - wide, by - 112, 90 + wide, 112, 16));
      } else sprites.box(ctx, 'ship/boiler', boiler.x - 70, by - 112, 90, 112);
      const gx = boiler.x + 60;
      const gy = by - 90;
      if (!sprites.box(ctx, 'ship/gauge', gx - 28, gy - 28, 56, 56)) filled('#f1e2b8', () => ctx.arc(gx, gy, 28, 0, 7));
    }

    // (The ship's wheel is drawn by drawHelmMount, out on the top deck.)

    // Chart table for the navigator.
    const nav = one('navigator');
    if (nav) {
      if (!sprites.box(ctx, 'ship/chart-table', nav.x - 40, P[nav.d].y - 52, 80, 52)) {
        filled('#e9dcb5', () => ctx.rect(nav.x - 40, P[nav.d].y - 52, 80, 12));
        line([[nav.x - 30, P[nav.d].y - 40], [nav.x - 30, P[nav.d].y]], 5);
        line([[nav.x + 30, P[nav.d].y - 40], [nav.x + 30, P[nav.d].y]], 5);
      }
    }

    // Ammo crates in the hold.
    const hold = one('ammo');
    if (hold) {
      const hy2 = P[hold.d].y;
      if (!sprites.box(ctx, 'ship/ammo-crates', hold.x + 20, hy2 - 50, 100, 50)) {
        [[30, 0], [64, 0], [47, -26]].forEach(([x, y]) => filled('#c9a05f', () => ctx.rect(hold.x + x, hy2 - 24 + y, 34, 24)));
      }
    }
  };

  // Boiler fire glow and the pressure gauge needle.
  const liveProps = (time) => {
    for (const boiler of all('boiler')) liveBoiler(boiler, time);
  };

  const liveBoiler = (boiler, time) => {
    const by = P[boiler.d].y;
    const glow = 0.5 + 0.5 * Math.sin(time * 6);
    const fuel = Math.min(1, (state.ship.fuel || 0) / 40);
    if (sprites.has('ship/boiler')) {
      // Fire glow over the firebox door.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,${100 + glow * 60},30,${0.15 + 0.45 * fuel})`;
      ctx.fillRect(boiler.x - 50, by - 48, 50, 30);
      ctx.restore();
    } else {
      ctx.fillStyle = fuel > 0 ? `rgba(255,${120 + glow * 80},40,${0.3 + 0.7 * fuel})` : '#3a3538';
      ctx.fillRect(boiler.x - 50, by - 48, 50, 30);
    }
    const gx = boiler.x + 60;
    const gy = by - 90;
    const angle = -Math.PI * 1.15 + (state.ship.press / 100) * Math.PI * 1.3;
    line([[gx, gy], [gx + Math.cos(angle) * 22, gy + Math.sin(angle) * 22]], 5, state.ship.press < config.BOILER.WARN_AT ? '#6fa07a' : '#a8443f');
  };

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

  // ================= VENTS =================
  // Steam vent stacks: the stack itself is static; open ones blow a big plume (handle turned) and closed ones hiss a
  // little when the pressure is high (live).
  const drawVents = () => {
    L.vents.forEach((v) => {
      const y = P[v.d].y;
      if (sprites.box(ctx, 'ship/vent', v.x - 16, y - 150, 32, 110)) return;
      filled('#9aa1a6', () => ctx.rect(v.x - 9, y - 140, 18, 100));
      filled('#6d7378', () => ctx.rect(v.x - 16, y - 150, 32, 14));
    });
  };

  const liveVents = (time) => {
    const high = state.ship.press >= config.BOILER.WARN_AT;
    const sprite = sprites.has('ship/vent');
    L.vents.forEach((v, i) => {
      const y = P[v.d].y;
      const open = state.ventOpen && state.ventOpen[i];
      if (!sprite) {
        filled(open ? '#4caf50' : '#a8443f', () => ctx.arc(v.x, y - 60, 13, 0, 7));
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
    const s = one('coal');
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

  // Medical bay sign (where anyone who falls off comes round).
  const drawMedbay = () => {
    const mb = L.medbay;
    const mp = mb && plat(mb.p);
    if (!mp) return;
    const y = mp.y - 120;
    filled('#f3ead6', () => ctx.roundRect(mb.x - 28, y - 28, 56, 56, 8));
    ctx.fillStyle = '#a8443f';
    ctx.fillRect(mb.x - 8, y - 20, 16, 40);
    ctx.fillRect(mb.x - 20, y - 8, 40, 16);
  };

  // Station name boards (lobby only): the ship is still and nobody has a phone telling them where things are.
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

  // Upgrade fittings: armour plates, sprinklers, the safety-valve whistle (static; the bake is redone when they change).
  const drawUpgradeFittings = () => {
    const armour = has('armour');
    const lower = plat('lower');
    const main = plat('main');
    for (let k = 0; k < armour; k++) {
      // Riveted steel plates along the hull's lower edge.
      for (let x = main.x0 + 130; x < main.x1 - 140; x += 90) {
        filled('#8d969b', () => ctx.rect(x, lower.y - 20 - k * 22, 80, 20));
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(x + 8, lower.y - 10 - k * 22, 2.5, 0, 7);
        ctx.arc(x + 72, lower.y - 10 - k * 22, 2.5, 0, 7);
        ctx.fill();
      }
    }
    if (has('sprinklers')) {
      for (const id of ['main', 'lower']) {
        const p = plat(id);
        const top = p.y - (id === 'lower' ? 138 : 146);
        for (let x = p.x0 + 120; x < p.x1 - 60; x += 220) {
          line([[x, top], [x, top + 12]], 4, '#9aa1a6');
          filled('#a8443f', () => ctx.arc(x, top + 15, 5, 0, 7));
        }
      }
    }
    if (has('safety-valve')) {
      for (const b of all('boiler')) {
        const y = P[b.d].y - 112;
        line([[b.x - 30, y], [b.x - 30, y - 22]], 6, '#c9a85a');
        filled('#c9a85a', () => ctx.roundRect(b.x - 38, y - 34, 16, 14, 4));
      }
    }
  };

  // ================= BOMB BAY =================
  // A rack of bombs inside and two doors in the belly that swing open on a drop.
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
  // This is the fixed part: the compartment, the shelves, the stencils. (Bombs, doors and the bombsight lamp are live.)
  const bayGeom = () => {
    const B = L.bombBay;
    const bp = B && plat('bay');
    if (!bp) return null;
    const hatch = L.connectors.find((c) => P[c.bottom] && P[c.bottom].id === 'bay');
    return { B, bp, fy: bp.y, x0: bp.x0, x1: bp.x1, top: bp.y - 113, half: B.doorHalf, rx0: bp.x0 + 50, rx1: bp.x0 + 158, sx: bp.x0 + 186, hatchX: hatch ? hatch.xTop : bp.x0 + 22 };
  };

  const drawBombBay = () => {
    const g = bayGeom();
    if (!g) return;
    const { B, fy, x0, x1, top, half, rx0, rx1, sx } = g;
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
    filled('#3d373b', () => ctx.rect(g.hatchX - 24, top + 8, 48, 8));
    // Stencilled name on the wall.
    ctx.font = '20px ' + config.FONTS.DISPLAY;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8c9c4';
    ctx.fillText('BOMB BAY', (x0 + x1) / 2 - 20, top + 52);
    // Bomb rack: a shelving frame with two shelves of three bombs; it empties as bombs are used.
    line([[rx0 - 4, top + 66], [rx0 - 4, fy]], 6, '#3d373b');
    line([[rx1, top + 66], [rx1, fy]], 6, '#3d373b');
    for (const sy of [fy - 30, fy - 68]) filled('#6b4a32', () => ctx.rect(rx0 - 8, sy, rx1 - rx0 + 14, 7));
    // Ammo point: crates stacked by the wall; bring an ammo crate to the bombardier to load bombs.
    filled('#c9a05f', () => ctx.rect(x1 - 52, fy - 34, 36, 34));
    line([[x1 - 52, fy - 34], [x1 - 16, fy]], 2.5, WOOD_DARK);
    filled('#b98a5a', () => ctx.rect(x1 - 44, fy - 66, 30, 32));
    ctx.font = '12px ' + config.FONTS.DISPLAY;
    ctx.fillStyle = INK;
    ctx.fillText('AMMO', x1 - 29, fy - 45);
    // Bombsight on a stand beside the bombardier, looking down through the doors.
    line([[sx, fy], [sx, fy - 54]], 6, IRON);
    line([[sx, fy - 54], [sx + 22, fy - 28]], 11, INK);
    line([[sx, fy - 54], [sx + 22, fy - 28]], 7, '#c9a85a');
    filled('#9a5a55', () => ctx.arc(sx + 24, fy - 26, 6, 0, 7)); // (the lamp is redrawn live: bright when manned)
    filled('#c9a85a', () => ctx.roundRect(sx - 10, fy - 62, 20, 12, 3));
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

  const liveBombBay = () => {
    const g = bayGeom();
    if (!g) return;
    const { B, fy, rx0, rx1, sx, half } = g;
    const bay = state.bombBay || { bombs: 0 };
    const open = Math.min(1, (bay.open || 0) * 3);
    // The bombs on the shelves, and the count.
    const shown = Math.min(bay.bombs, 6);
    for (let i = 0; i < shown; i++) drawBomb(rx0 + 28 + (i % 3) * 38, (i < 3 ? fy - 30 : fy - 68) - 10);
    ctx.font = '16px ' + config.FONTS.DISPLAY;
    ctx.textAlign = 'center';
    ctx.fillStyle = bay.bombs > 0 ? '#f2d36b' : '#e8887f';
    ctx.fillText(bay.bombs > 0 ? 'BOMBS x' + bay.bombs : 'EMPTY', (rx0 + rx1) / 2, fy - 86);
    // The bombsight's lamp is bright when somebody is manning it.
    const manned = Object.values(state.players).some((q) => kindOf(q.lock) === 'bombBay');
    if (manned) filled('#ff6a5c', () => ctx.arc(sx + 24, fy - 26, 6, 0, 7));
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
  };

  // ================= THE LAYERS =================
  // Draw order, as in the old single pass: gasbag (live) < BACK (static) < the live bits that sit on the decks < FRONT
  // (static: ladders, ropes, poles, the top deck - they pass in front of the boiler fire, the helm wheel, the steam ...)
  // < lobby name boards < holes, damage and status (live).
  // Each piece is drawn on its own save/restore and can never take the whole ship down with it.
  const guard = (name, fn, ...args) => {
    ctx.save();
    try {
      fn(...args);
    } catch (e) {
      const list = (globalThis.gameErrors = globalThis.gameErrors || []);
      if (list.length < 50) list.push('shipArt ' + name + ': ' + (e && e.message));
    } finally {
      ctx.restore();
    }
  };

  const drawBackLayer = () => {
    guard('nest', drawNest);
    guard('gondola', drawGondola);
    guard('upgrades', drawUpgradeFittings);
    guard('outriggers', drawOutriggers);
    guard('pod', drawPod);
    guard('hangar', drawHangar);
    guard('pipes', drawPipes);
    guard('racks', drawRacks);
    guard('extinguishers', drawExtinguishers);
    guard('props', drawProps);
    guard('coal', drawCoal);
    guard('bombBay', drawBombBay);
    guard('helm', drawHelmMount);
    guard('medbay', drawMedbay);
    guard('vents', drawVents);
  };

  const drawFrontLayer = () => {
    guard('connectors', drawConnectors);
    guard('catwalk', drawCatwalk);
  };

  const drawLiveMid = (time) => {
    guard('engines', liveEngines, time);
    guard('escorts', liveHangar);
    guard('valves', livePipes);
    guard('boiler', liveProps, time);
    guard('iceLocker', drawIceLocker, ctx, state, time);
    guard('bombs', liveBombBay);
    guard('wheel', liveHelm);
    guard('steam', liveVents, time);
    guard('lift', liveConnectors);
  };

  const drawLiveTop = (time) => {
    if (state.phase === 'lobby') guard('labels', drawLabels); // (in flight each phone says where you are)
    guard('holes', drawGasHoles, time);
    guard('status', drawModuleStatus, time);
    guard('heat', drawBoilerHeat, ctx, state, time); // GOING DOWN!: the boiler's heat bar and the ice blocks in flight
    guard('ice', drawIceFlights, ctx, state);
  };

  // ---- The bake: one offscreen canvas per static layer, in ship space ----
  const bake = { back: null, front: null, bags: [], twin: null, key: '', scale: 0, x: 0, y: 0, w: 0, h: 0, failed: false };
  let sigCount = 0;
  let sigCache = '';

  // Everything (other than the zoom) that makes the baked pictures out of date.
  const signature = () => {
    if (sigCount++ % 20 === 0 || !sigCache) {
      let s = '';
      for (const k of STATIC_SPRITES) s += sprites.has(k) ? '1' : '0';
      s += '|';
      for (const t of STATIC_TEXTURES) s += hasTexture(t) ? '1' : '0';
      s += '|';
      try {
        s += document.fonts.check('20px ' + config.FONTS.DISPLAY) ? '1' : '0';
      } catch (e) { s += 'x'; }
      sigCache = s;
    }
    return sigCache + '|' + L.version + '|' + STATIC_UPGRADES.map(has).join(',');
  };

  // The ship-space rectangle the bake covers: the drawing's outer edges, plus a margin.
  const bakeRect = () => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const b = L.bounds;
    if (b) { x0 = b.x0; y0 = b.y0; x1 = b.x1; y1 = b.y1; }
    for (const p of P) {
      x0 = Math.min(x0, p.x0 - 60);
      x1 = Math.max(x1, p.x1 + 60);
      y0 = Math.min(y0, p.y - 260);
      y1 = Math.max(y1, p.y + 130);
    }
    for (const e of L.engines) { x0 = Math.min(x0, e.x - 160); x1 = Math.max(x1, e.x + 160); }
    return { x: Math.floor(x0 - 30), y: Math.floor(y0 - 30), w: Math.ceil(x1 - x0 + 60), h: Math.ceil(y1 - y0 + 60) };
  };

  // Paint `draw` into a canvas covering the ship-space box r at scale s; returns { canvas, x, y, w, h } (w, h in ship units).
  const paintTo = (slot, r, s, draw) => {
    const cw = Math.max(1, Math.min(BAKE_MAX, Math.ceil(r.w * s)));
    const ch = Math.max(1, Math.min(BAKE_MAX, Math.ceil(r.h * s)));
    const cv = slot && slot.canvas ? slot.canvas : document.createElement('canvas');
    cv.width = cw; // (resizing also clears it)
    cv.height = ch;
    const bc = cv.getContext('2d');
    const saved = ctx;
    ctx = bc;
    try {
      bc.setTransform(s, 0, 0, s, -r.x * s, -r.y * s);
      bc.lineJoin = 'round';
      bc.lineCap = 'round';
      draw();
    } finally {
      ctx = saved;
    }
    return { canvas: cv, x: r.x, y: r.y, w: cw / s, h: ch / s, s, rects: sparseRects(cv) };
  };

  // Which parts of a baked picture actually have something on them: a short list of source rectangles (canvas px) covering every
  // non-empty TILE px square, runs of tiles merged. Blitting just those saves filling the empty sky around a mostly empty layer.
  // Each rectangle is grown by a pixel so neighbours overlap (no hairline seams when the ship tilts). null = blit it all.
  const TILE = 64;
  const sparseRects = (cv) => {
    try {
      const w = cv.width;
      const h = cv.height;
      const u32 = new Uint32Array(cv.getContext('2d').getImageData(0, 0, w, h).data.buffer);
      const cols = Math.ceil(w / TILE);
      const rows = Math.ceil(h / TILE);
      const open = [];
      const out = [];
      for (let ty = 0; ty < rows; ty++) {
        const y0 = ty * TILE;
        const y1 = Math.min(h, y0 + TILE);
        const next = new Map();
        let tx = 0;
        while (tx < cols) {
          // is tile (tx, ty) occupied?
          let used = false;
          const x0 = tx * TILE;
          const x1 = Math.min(w, x0 + TILE);
          for (let y = y0; y < y1 && !used; y++) {
            for (let i = y * w + x0, e = y * w + x1; i < e; i++) if (u32[i] >>> 24) { used = true; break; }
          }
          if (!used) { tx++; continue; }
          let end = tx + 1;
          for (; end < cols; end++) {
            let u = false;
            const a = end * TILE;
            const b = Math.min(w, a + TILE);
            for (let y = y0; y < y1 && !u; y++) for (let i = y * w + a, e = y * w + b; i < e; i++) if (u32[i] >>> 24) { u = true; break; }
            if (!u) break;
          }
          const key = tx + ':' + end;
          const prev = open.find((o) => o.key === key);
          if (prev) { prev.y1 = y1; next.set(key, prev); } else { const o = { key, x0: tx * TILE, x1: Math.min(w, end * TILE), y0, y1 }; out.push(o); next.set(key, o); }
          tx = end;
        }
        open.length = 0;
        open.push(...next.values());
      }
      return out.map((o) => {
        const sx = Math.max(0, o.x0 - 1);
        const sy = Math.max(0, o.y0 - 1);
        return { sx, sy, sw: Math.min(w, o.x1 + 1) - sx, sh: Math.min(h, o.y1 + 1) - sy };
      });
    } catch (e) {
      return null;
    }
  };

  // Draw a baked picture (only its non-empty parts) in ship space, at its own pixel density.
  const drawPic = (pic) => {
    const smooth = ctx.imageSmoothingQuality;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = ART().SMOOTH || 'high';
    try {
      if (!pic.rects) ctx.drawImage(pic.canvas, pic.x, pic.y, pic.w, pic.h);
      else for (const q of pic.rects) ctx.drawImage(pic.canvas, q.sx, q.sy, q.sw, q.sh, pic.x + q.sx / pic.s, pic.y + q.sy / pic.s, q.sw / pic.s, q.sh / pic.s);
    } catch (e) {
      bake.failed = true;
    }
    ctx.imageSmoothingQuality = smooth;
  };

  const rebake = (key, k) => {
    const r = bakeRect();
    let s = Math.max(0.2, Math.min(3, k)) * bakeSS();
    s = Math.min(s, BAKE_MAX / r.w, BAKE_MAX / r.h);
    const back = paintTo(bake.back, r, s, drawBackLayer);
    const front = paintTo(bake.front, r, s, drawFrontLayer);
    const list = bags();
    const bagPics = list.map((G, i) => paintTo(bake.bags[i], bagRect(G), s, () => guard('bag', paintBag, G, i === 0)));
    const twin = list.length && has('twin-gasbag') ? paintTo(bake.twin, twinRect(list[0]), s, () => guard('twin', paintTwin, list[0])) : null;
    bake.back = back;
    bake.front = front;
    bake.bags = bagPics;
    bake.twin = twin;
    bake.key = key;
    bake.scale = s;
  };

  // Blit one baked layer onto the screen.
  const blit = drawPic;

  // Make sure the bake is current for this zoom (a bake problem switches to drawing the old way, directly).
  const ensureBake = () => {
    if (bake.failed || ART().OFF || typeof document === 'undefined') return false;
    try {
      const m = ctx.getTransform();
      const k = Math.hypot(m.a, m.b) || 1; // screen pixels per ship unit right now (zoom x pixel ratio)
      const key = signature();
      const ratio = (k * bakeSS()) / (bake.scale || 1);
      const zoomStep = Math.max(0.05, Number(ART().BAKE_ZOOM) || 0.25);
      if (!bake.back || key !== bake.key || ratio > 1 + zoomStep || ratio < 1 / (1 + zoomStep)) rebake(key, k);
      return true;
    } catch (e) {
      bake.failed = true;
      ctx = screenCtx;
      const list = (globalThis.gameErrors = globalThis.gameErrors || []);
      if (list.length < 50) list.push('shipArt bake: ' + (e && e.message));
      return false;
    }
  };

  // Debugging: set window.shipProfile = {} and each frame adds the ms spent per part of the ship to it (it forces the canvas
  // to finish drawing at every step, so the numbers are real raster cost).
  let lapT = 0;
  const lap = (name) => {
    const SP = globalThis.shipProfile;
    if (!SP) return;
    try { screenCtx.getImageData(0, 0, 1, 1); } catch (e) { /* (tainted canvas: just time the commands) */ }
    const now = performance.now();
    if (name) SP[name] = (SP[name] || 0) + now - lapT;
    lapT = now;
  };

  return (time) => {
    ctx = screenCtx;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    lap();
    const baked = ensureBake();
    lap('bake');
    if (!baked) { bake.bags = []; bake.twin = null; }
    guard('gasbag', drawGasbag); // (behind everything else)
    lap('gasbag');
    if (baked) blit(bake.back);
    else drawBackLayer();
    lap('back');
    drawLiveMid(time);
    lap('liveMid');
    if (baked) blit(bake.front);
    else drawFrontLayer();
    lap('front');
    drawLiveTop(time);
    lap('liveTop');
  };
}
