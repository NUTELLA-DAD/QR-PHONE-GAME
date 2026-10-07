// Drawing for an enemy gunship (ship coordinates - drawn inside the ship's transform). She is drawn
// in her own home frame, shifted to wherever she is now (g.dx, g.dy). Everything on her shows what her
// systems are doing (see gunship.js):
//   - GASBAG swells and sags with g.gas (slack wrinkles when it's low)
//   - 1-3 ENGINE pods with propellers that spin with the throttle, cough when damaged and smoke when hurt
//   - BOILER with a smokestack that feeds off g.steam (cold boiler = no smoke, dim fire)
//   - HELM wheel that turns as the helmsman steers
//   - she pitches nose-up / nose-down in climbs and dives
//   - TURNING ROUND: the airframe squashes through the middle (scale through zero) and comes out mirrored;
//     g.m is the facing (+1 nose right, -1 nose left), her crew are drawn at their own (already mirrored) places
//   - a PENNANT on a mast shows what her captain intends: crossed swords = attack, swords + dashes = strafing run,
//     arrow back = withdrawing, hammer = repairing, hook = latching on, up-arrow + chute = climbing to drop
//     paratroopers, chevrons = closing in. Far off on her way in she is drawn smaller (a shape on the horizon).
// Every gunship is drawn from her blueprint (g.bp, see gunshipBlueprint.js): hull length, stepped decks with ladders, one or
// two gasbags, engine pods, her guns (stern cannon ports, top turret, mortar, flak gun), special gear (bat hangar door, boarding
// ramp, harpoon gun, armoured boiler, parachute rack), her name and flag colours, so no two look alike.
// Also: her crew, the grapple rope to our bow (sagging when slack, straight when taut), the swing line,
// and the charge ticking on her boiler. Style 2026: enemy oxblood + charcoal, thin outlines.
import { BOW, mx } from './gunship.js';
import { config } from '../../config.js';
import { paintPath, paintRect } from './textureArt.js';
import { createSprites } from './sprites.js';

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const report = (e) => {
  const list = (globalThis.gameErrors = globalThis.gameErrors || []);
  if (list.length < 50) list.push('gunship art: ' + (e && e.message));
};
const BAG = '#5a3a40';
const HULL = '#4a2626';
const CREAM = '#ebdfc0';

const INK = '#3e2c20';
const BONE = '#e8dcc0';
const OXB = '#7a2f2f';
const CHAR = '#2f2a2e';

export function createGunshipArt({ ctx, state, ink, sprites: given }) {
  // Painted sprites (art/sprites/gunship/*). If the caller gave no sprite loader (test pages), load our own.
  let sprites = given;
  if (!sprites) {
    try {
      sprites = createSprites();
      sprites.load();
    } catch (e) {
      report(e);
    }
  }
  const has = (k) => !!(sprites && sprites.has && sprites.has(k));
  const tintCache = new Map();
  const patCache = new Map();
  // A neutral (mid-grey = no change) painted sprite laid over a flat colour with the 'overlay' blend, clipped to the
  // sprite's own shape: gives every gunship her own bag / hull colour with the same painting. Cached per colour.
  const overlaid = (key, color) => {
    try {
      const id = key + color;
      if (tintCache.has(id)) return tintCache.get(id);
      const img = sprites.get(key);
      if (!img || typeof document === 'undefined') return null;
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      g.fillStyle = color;
      g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'overlay';
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(img, 0, 0);
      tintCache.set(id, c);
      return c;
    } catch (e) {
      report(e);
      return null;
    }
  };
  // Tile a neutral plate sprite over a rect (call inside the clip): origin (ox, oy), world units per px = 0.5.
  // The tile is blended with the flat colour ONCE (overlay, `passes` times) and cached per colour, then drawn
  // with a plain fill: an overlay blend every frame was slow on the graphics card.
  const overlayTile = (key, color, passes, ox, oy, x, y, w, h) => {
    try {
      const id = key + color + passes;
      let p = patCache.get(id);
      if (!p) {
        const img = sprites.get(key);
        if (!img || typeof document === 'undefined') return;
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext('2d');
        g.fillStyle = color;
        g.fillRect(0, 0, c.width, c.height);
        g.globalCompositeOperation = 'overlay';
        for (let i = 0; i < passes; i++) g.drawImage(img, 0, 0);
        p = ctx.createPattern(c, 'repeat');
        if (!p) return;
        patCache.set(id, p);
      }
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(0.5, 0.5);
      ctx.fillStyle = p;
      ctx.fillRect((x - ox) * 2, (y - oy) * 2, w * 2, h * 2);
      ctx.restore();
    } catch (e) {
      report(e);
    }
  };
  // A little riveted iron plate (mounts under guns, boiler trim).
  const ironPlate = (x, y, w, h) => {
    ctx.fillStyle = '#3a3438';
    ctx.fillRect(x, y, w, h);
    paintRect(ctx, 'charcoal', x, y, w, h);
    ctx.fillStyle = 'rgba(255,235,215,.16)';
    ctx.fillRect(x, y, w, Math.min(3, h / 3));
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#9a9086';
    for (let rx = x + 6; rx < x + w - 3; rx += 14) {
      ctx.beginPath();
      ctx.arc(rx, y + h / 2, 1.8, 0, 7);
      ctx.fill();
    }
  };
  // Her paratroopers: a raider under a dark red chute (same style as a bailed-out pilot's).
  const drawParas = (time) => {
    for (const p of state.paras || []) {
      if (p.t < 0) continue;
      const open = Math.max(0, Math.min(1, p.t / 0.5));
      const sway = Math.sin(time * 2 + p.x * 0.01) * 0.15 * open;
      const rd = config.RAIDERS[p.type] || config.RAIDERS.grunt;
      const s = rd.scale || 1;
      ctx.save();
      ctx.translate(p.x, p.y + state.ship.alt); // (this layer is in ship coordinates; paratroopers live in world coordinates)
      ctx.rotate(sway);
      ink();
      ctx.lineWidth = 2.4;
      if (open > 0.2) {
        ctx.fillStyle = '#8c2f2f';
        ctx.beginPath();
        ctx.ellipse(0, -72, 50 * open, 36 * open, 0, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#eee6d2';
        ctx.beginPath();
        ctx.ellipse(0, -72, 16 * open, 36 * open, 0, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        for (const k of [-1, -0.4, 0.4, 1]) {
          ctx.moveTo(k * 48 * open, -72);
          ctx.lineTo(0, -18);
        }
        ctx.stroke();
      }
      ctx.fillStyle = rd.color;
      ctx.beginPath();
      ctx.roundRect(-9 * s, -22 * s, 18 * s, 26 * s, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#efe9dc';
      ctx.beginPath();
      ctx.arc(0, -30 * s, 9 * s, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  };

  // A plume of smoke puffs rising from (x, y): count puffs cycling with time. `back` drifts them sideways.
  const plume = (time, x, y, count, rise, back, r0, r1, rgb, alpha) => {
    for (let k = 0; k < count; k++) {
      const ph = (time * 0.7 + k / count) % 1;
      ctx.fillStyle = `rgba(${rgb},${(1 - ph) * alpha})`;
      ctx.beginPath();
      ctx.arc(x + back * ph + Math.sin(time * 3 + k * 2) * 4, y - rise * ph, r0 + (r1 - r0) * ph, 0, 7);
      ctx.fill();
    }
  };

  // The intent pennant on her mast (canonical frame, mast foot at (mx0, my0)). The cloth and trim are HER flag colours
  // (each gunship has her own); the cream badge shows what her captain intends.
  const drawPennant = (g, time, mx0, my0) => {
    const intent = g.intent || 'attack';
    const flag = g.bp.flag;
    const col = flag.a;
    const top = my0 - 100;
    ink();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(mx0, my0);
    ctx.lineTo(mx0, top - 12);
    ctx.stroke();
    // the flag flutters (more at speed)
    const fl = 4 + Math.min(10, Math.abs(num(g.wvx)) * 0.015);
    const W = 116;
    const H = 66;
    const fx = mx0 + 2;
    const fy = top;
    const wav = (u) => Math.sin(time * 9 - u * 5) * fl * u;
    const cloth = () => {
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      for (let k = 1; k <= 8; k++) ctx.lineTo(fx + (W * k) / 8, fy + wav(k / 8));
      ctx.lineTo(fx + W, fy + H * 0.5 + wav(1));
      ctx.lineTo(fx + W - 18, fy + H * 0.5 + wav(1) * 0.7); // swallow-tail
      ctx.lineTo(fx + W, fy + H + wav(1));
      for (let k = 7; k >= 0; k--) ctx.lineTo(fx + (W * k) / 8, fy + H + wav(k / 8));
      ctx.closePath();
    };
    ctx.fillStyle = col;
    cloth();
    ctx.fill();
    // her own pattern on the outer part of the cloth (clear of the badge)
    ctx.save();
    cloth();
    ctx.clip();
    ctx.fillStyle = flag.b;
    const px0 = fx + W * 0.66;
    const pw = W - W * 0.66;
    if (flag.pattern === 'band') ctx.fillRect(px0, fy + H * 0.36, pw, H * 0.28);
    else if (flag.pattern === 'diagonal') {
      ctx.beginPath();
      ctx.moveTo(px0, fy + H);
      ctx.lineTo(fx + W, fy + H);
      ctx.lineTo(fx + W, fy);
      ctx.closePath();
      ctx.fill();
    } else if (flag.pattern === 'chevron') {
      ctx.beginPath();
      ctx.moveTo(px0, fy);
      ctx.lineTo(px0 + pw * 0.6, fy + H / 2);
      ctx.lineTo(px0, fy + H);
      ctx.lineTo(px0 + pw * 0.35, fy + H);
      ctx.lineTo(px0 + pw * 0.95, fy + H / 2);
      ctx.lineTo(px0 + pw * 0.35, fy);
      ctx.closePath();
      ctx.fill();
    } else if (flag.pattern === 'split') ctx.fillRect(px0 + pw * 0.4, fy - 4, pw, H + 8);
    else for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) if ((r + c) % 2 === 0) ctx.fillRect(px0 + c * pw * 0.5, fy + r * (H / 4), pw * 0.5, H / 4);
    ctx.restore();
    ctx.lineWidth = 3;
    cloth();
    ctx.stroke();
    // the badge, in cream, near the hoist so it stays readable
    ctx.save();
    ctx.translate(fx + 40, fy + H / 2 + wav(0.35) * 0.4);
    ctx.strokeStyle = CREAM;
    ctx.fillStyle = CREAM;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (intent === 'attack' || intent === 'strafe') {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-22, -22 * s);
        ctx.lineTo(22, 22 * s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s * 10 - 8, -s * 10 + 8 * 0);
        ctx.lineTo(s * 10 + 8, -s * 10);
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.lineWidth = 5;
      }
      if (intent === 'strafe') {
        ctx.lineWidth = 3;
        for (const k of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(30 + (time * 60) % 10, k * 10);
          ctx.lineTo(48 + (time * 60) % 10, k * 10);
          ctx.stroke();
        }
      }
    } else if (intent === 'retreat' || intent === 'flee') {
      // arrow pointing back toward the stern (to the left)
      ctx.beginPath();
      ctx.moveTo(26, 0);
      ctx.lineTo(-22, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-8, -16);
      ctx.lineTo(-24, 0);
      ctx.lineTo(-8, 16);
      ctx.stroke();
      if (intent === 'retreat' && g.atRetreat) {
        // repairing: a little hammer ticking
        ctx.lineWidth = 4;
        ctx.save();
        ctx.translate(36, 4);
        ctx.rotate(Math.sin(time * 12) * 0.6 - 0.4);
        ctx.beginPath();
        ctx.moveTo(0, 14);
        ctx.lineTo(0, -10);
        ctx.stroke();
        ctx.fillRect(-9, -16, 18, 9);
        ctx.restore();
      }
    } else if (intent === 'latch') {
      // grappling hook
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.lineTo(0, 12);
      ctx.arc(-10, 12, 10, 0, Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-12, -14);
      ctx.lineTo(12, -14);
      ctx.stroke();
    } else if (intent === 'climb') {
      // up arrow with a little parachute
      ctx.beginPath();
      ctx.moveTo(-14, 22);
      ctx.lineTo(-14, -6);
      ctx.moveTo(-26, 4);
      ctx.lineTo(-14, -10);
      ctx.lineTo(-2, 4);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(26, -2, 15, Math.PI, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(11, -2);
      ctx.lineTo(26, 18);
      ctx.lineTo(41, -2);
      ctx.stroke();
    } else {
      // approaching: chevrons pointing forward
      for (const k of [-14, 6, 26]) {
        ctx.beginPath();
        ctx.moveTo(k - 10, -16);
        ctx.lineTo(k + 4, 0);
        ctx.lineTo(k - 10, 16);
        ctx.stroke();
      }
    }
    ctx.restore();
    ink();
  };

  return (time) => {
    drawParas(time);
    const g = state.gunship;
    if (!g || !g.bp) return;
    try {
      drawGunship(g, time);
    } catch (e) {
      report(e);
    }
  };

  // Bottom edge of the gasbags at x (or null if no bag is there).
  function bagBottomAt(bp, x) {
    let best = null;
    for (const b of bp.bags) {
      const u = (x - b.cx) / b.rx;
      if (Math.abs(u) >= 1) continue;
      const yy = b.cy + b.ry * Math.sqrt(1 - u * u);
      if (best === null || yy > best) best = yy;
    }
    return best;
  }
  function segAtC(bp, x) {
    return bp.decks.find((d) => x <= d.x1) || bp.decks[bp.decks.length - 1];
  }

  // The emblem on a gasbag.
  function drawEmblem(kind, flag, b, gas) {
    const sc = Math.min(1, b.ry / 160) * (0.8 + 0.2 * gas);
    ctx.save();
    ctx.translate(b.cx, b.cy);
    ctx.scale(sc, sc);
    ink();
    ctx.lineWidth = 3;
    if (kind === 'horns') {
      ctx.fillStyle = flag.a;
      ctx.beginPath();
      ctx.arc(0, 0, 60, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#2b2622';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 22, 30);
        ctx.quadraticCurveTo(s * 40, -30, s * 10, -40);
        ctx.quadraticCurveTo(s * 18, -5, s * 6, 25);
        ctx.fill();
      }
    } else if (kind === 'eye') {
      ctx.fillStyle = CREAM;
      ctx.beginPath();
      ctx.ellipse(0, 0, 72, 42, 0, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = flag.a;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#2b2622';
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 22, 0, 0, 7);
      ctx.fill();
    } else if (kind === 'band') {
      ctx.fillStyle = flag.a;
      ctx.fillRect(-b.rx * 0.5 / sc, -26, (b.rx * 1.0) / sc, 52);
      ctx.fillStyle = flag.b;
      ctx.fillRect(-b.rx * 0.5 / sc, -26, (b.rx * 1.0) / sc, 9);
      ctx.fillRect(-b.rx * 0.5 / sc, 17, (b.rx * 1.0) / sc, 9);
    } else if (kind === 'chevrons') {
      ctx.strokeStyle = flag.b;
      ctx.lineWidth = 14;
      ctx.lineJoin = 'round';
      for (const o of [-52, 0, 52]) {
        ctx.beginPath();
        ctx.moveTo(o - 22, -42);
        ctx.lineTo(o + 20, 0);
        ctx.lineTo(o - 22, 42);
        ctx.stroke();
      }
    } else {
      // fangs: a toothy red mouth
      ctx.fillStyle = flag.a;
      ctx.beginPath();
      ctx.ellipse(0, 0, 64, 40, 0, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = CREAM;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 18 - 10, -26);
        ctx.lineTo(s * 18, 14);
        ctx.lineTo(s * 18 + 10, -26);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawGunship(g, time) {
    const GC = config.GUNSHIP;
    const bp = g.bp;
    const dx = num(g.dx);
    const dy = num(g.dy);
    const m = g.m < 0 ? -1 : 1;
    const sink = g.phase === 'sinking' ? g.sink * g.sink * 120 : 0;
    const x0 = bp.x0;
    const x1 = bp.x1;
    const cx = bp.cx;
    const flag = bp.flag;
    const topY = bp.hullTop;
    const botY = bp.hullBot;
    const pivotY = botY - 190; // (she pitches and shrinks about about her middle)
    const gas = clamp(num(g.gas, 0.5), 0, 1);
    const hpF = clamp(num(g.hp, 1) / Math.max(1, num(g.max, 1)), 0, 1);
    const tk = g.turn ? Math.min(1, num(g.turn.t) / GC.TURN_TIME) : 0;
    const sq = g.turn ? Math.abs(Math.cos(Math.PI * tk)) : 1; // squash while she turns round
    const sx = m * sq;
    const far = clamp(1 - (Math.abs(dx) - 2200) / 5000, 0.5, 1); // a small shape on the horizon until she is close
    const thr = num(g.thr);
    const steam = clamp(num(g.steam, 0.8), 0, 1);
    const crewAboard = Object.values(state.players).some((p) => p.onGunship);

    // The rope and swing line are drawn in ship coordinates, after her own transform is undone.
    const drawRope = () => {
      if (!g.rope) return;
      const ap = bp.anchor;
      const ax = mx(g, ap.x) + dx;
      const ay = ap.y + dy + sink;
      const swingers = Object.values(state.players).filter((p) => p.swing);
      ctx.strokeStyle = '#d8c79a';
      ctx.lineWidth = 2.8;
      for (const p of swingers) {
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(p.x, p.y - 90);
        ctx.stroke();
      }
      // The grapple rope itself: straight when taut, sagging when slack.
      const len = Math.hypot(ax - BOW.x, ay - BOW.y);
      const slack = Math.max(0, (g.ropeLen || len) - len);
      const sag = Math.min(160, Math.sqrt(slack * 400)) * (1 - 0.9 * Math.min(1, g.tension || 0));
      ctx.strokeStyle = g.tension > 0.6 && Math.sin(time * 40) > 0 ? '#ffffff' : '#d8c79a'; // about to snap: it flickers
      ctx.lineWidth = g.tension > 0 ? 3.6 : 3;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo((ax + BOW.x) / 2, (ay + BOW.y) / 2 + sag * 2, BOW.x, BOW.y);
      ctx.stroke();
      // The grapple head on her yardarm.
      ctx.fillStyle = '#8a8a8a';
      ctx.beginPath();
      ctx.arc(ax, ay, 8, 0, 7);
      ctx.fill();
    };

    // A gun barrel pointing at our ship: angle in the canonical frame from a point.
    const aimFrom = (wx, wy) => {
      const a = Math.atan2(640 - (wy + dy), 800 - (mx(g, wx) + dx));
      return m > 0 ? a : Math.PI - a;
    };

    // ---- The airframe, drawn in the canonical frame (nose right, stern + guns + yardarm at the left) ----
    const drawAirframe = () => {
      ink();
      const flash = g.hit > 0;
      // Speed streaks behind her stern when she is really moving through the air.
      const relSpeed = Math.abs(num(g.wvx) - num(state.ship.speed) * 560);
      if (relSpeed > 450 && g.phase !== 'sinking') {
        ctx.strokeStyle = 'rgba(255,255,255,.22)';
        ctx.lineWidth = 3;
        for (let k = 0; k < 4; k++) {
          const yy = bp.bagTop + 110 + k * ((botY - bp.bagTop - 150) / 3) + Math.sin(time * 7 + k) * 8;
          const off = (time * 900 + k * 130) % 260;
          ctx.beginPath();
          ctx.moveTo(x0 - 120 - off, yy);
          ctx.lineTo(x0 - 120 - off - 90, yy);
          ctx.stroke();
        }
        ink();
      }
      // Gasbags (one or two): swell with the gas, go slack when it is low.
      bp.bags.forEach((b, bi) => {
        const rx = b.rx * (0.97 + 0.03 * gas);
        const ry = b.ry * (0.78 + 0.22 * gas);
        ctx.lineWidth = 3.2;
        ctx.fillStyle = flash ? '#ffffff' : bp.bagColor;
        ctx.beginPath();
        ctx.ellipse(b.cx, b.cy, rx, ry, 0, 0, 7);
        ctx.fill();
        if (!flash) {
          const painted = has('gunship/gasbag') ? overlaid('gunship/gasbag', bp.bagColor) : null;
          ctx.save();
          ctx.clip();
          if (painted) {
            // The painted patched canvas (stitched seams, iron bands, rough patches), in HER bag colour.
            ctx.drawImage(painted, b.cx - rx, b.cy - ry, rx * 2, ry * 2);
          } else {
            // (no sprite yet: one soft highlight band on top and a shadow band underneath)
            ctx.fillStyle = 'rgba(255,235,215,0.13)';
            ctx.beginPath();
            ctx.ellipse(b.cx - 20, b.cy - ry * 0.4, rx * 0.88, ry * 0.42, 0, 0, 7);
            ctx.fill();
            ctx.fillStyle = 'rgba(20,8,10,0.2)';
            ctx.beginPath();
            ctx.ellipse(b.cx + 30, b.cy + ry * 0.8, rx * 0.95, ry * 0.4, 0, 0, 7);
            ctx.fill();
          }
          ctx.restore();
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(b.cx, b.cy, rx, ry, 0, 0, 7);
          ctx.clip();
          paintPath(ctx, 'enemycanvas', 1);
          // Burnt patches where she has been shot up (fixed places, darker as she gets worse).
          if (hpF < 0.7) {
            const burn = clamp((0.7 - hpF) / 0.5, 0, 1);
            const spots = [[-0.32, -0.25, 0.16], [0.28, 0.1, 0.13], [0.05, 0.45, 0.18], [-0.6, 0.3, 0.11]];
            spots.forEach(([u, v, r], si) => {
              if (si > 1 + burn * 3) return;
              const px = b.cx + u * rx;
              const py = b.cy + v * ry;
              const rr = Math.max(8, r * ry * 2.2);
              const gr = ctx.createRadialGradient(px, py, 1, px, py, rr);
              gr.addColorStop(0, `rgba(14,8,8,${0.55 * burn + 0.2})`);
              gr.addColorStop(0.6, `rgba(30,16,14,${0.3 * burn + 0.1})`);
              gr.addColorStop(1, 'rgba(30,16,14,0)');
              ctx.fillStyle = gr;
              ctx.fillRect(px - rr, py - rr, rr * 2, rr * 2);
              ctx.fillStyle = 'rgba(10,6,6,.85)';
              ctx.beginPath();
              ctx.ellipse(px, py, rr * 0.15, rr * 0.1, 0.4, 0, 7); // a torn hole
              ctx.fill();
            });
          }
          ctx.restore();
        }
        ctx.beginPath();
        ctx.ellipse(b.cx, b.cy, rx, ry, 0, 0, 7);
        ctx.stroke();
        if (gas < 0.45) {
          // slack fabric: wrinkles across the lower bag
          ctx.strokeStyle = 'rgba(0,0,0,.28)';
          ctx.lineWidth = 3;
          const w = b.rx * 0.5;
          for (let k = 0; k < 3; k++) {
            ctx.beginPath();
            ctx.moveTo(b.cx - w + k * 40, b.cy + ry * 0.35);
            ctx.quadraticCurveTo(b.cx - w * 0.3 + k * 120 * (w / 330), b.cy + ry * (0.7 - k * 0.1) + Math.sin(time * 2 + k) * 4, b.cx + w - k * 40, b.cy + ry * 0.35);
            ctx.stroke();
          }
        }
        // Tail fins at the stern end of the stern bag.
        if (bi === 0) {
          ink();
          ctx.lineWidth = 3;
          ctx.fillStyle = flash ? '#ffffff' : '#3a2a30';
          for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(b.cx - 0.79 * b.rx, b.cy + s * (ry * 0.62));
            ctx.lineTo(b.cx - 0.97 * b.rx, b.cy + s * (ry * 0.2 + 26));
            ctx.lineTo(b.cx - 0.91 * b.rx, b.cy + s * (ry * 0.62));
            ctx.closePath();
            ctx.fill();
            if (!flash) paintPath(ctx, 'enemycanvas', 1);
            ctx.stroke();
          }
        }
        drawEmblem(bp.emblem, flag, b, gas);
        // Gas leaking from a holed bag (hurt, or nobody tending it).
        if (bi === 0 && (hpF < 0.5 || (g.posts && !g.posts.helm))) plume(time, b.cx + 120, b.cy - ry + 20, 3, 60, -40, 5, 16, '200,200,200', 0.35);
        ink();
      });
      // Rigging.
      ink();
      ctx.lineWidth = 3;
      for (let k = 0; k < 5; k++) {
        const rxk = x0 + 100 + k * ((x1 - x0 - 200) / 4);
        const yb = bagBottomAt(bp, rxk);
        if (yb === null) continue;
        ctx.beginPath();
        ctx.moveTo(rxk, yb - 8);
        ctx.lineTo(rxk, segAtC(bp, rxk).y - 80);
        ctx.stroke();
      }
      // Yardarm sticking out toward us (the hookshot catches it), at the stern end.
      const ax = bp.anchor.x;
      const ay = bp.anchor.y;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(x0 + 120, ay + 40);
      ctx.lineTo(ax, ay);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(x0 + 160, topY - 40);
      ctx.stroke();
      // Hull: stepped along the top where her decks step, flat underneath.
      const ds = bp.decks;
      ctx.lineWidth = 3.2;
      ctx.fillStyle = flash ? '#ffffff' : bp.hullColor;
      const hullPath = () => {
        ctx.beginPath();
        ctx.moveTo(x0 - 75, ds[0].y - 80);
        ds.forEach((d, i) => {
          ctx.lineTo(i === ds.length - 1 ? x1 + 75 : d.x1, d.y - 80);
          if (i < ds.length - 1) ctx.lineTo(d.x1, ds[i + 1].y - 80);
        });
        ctx.lineTo(x1 + 30, botY);
        ctx.lineTo(x0 - 30, botY);
        ctx.closePath();
      };
      hullPath();
      ctx.fill();
      if (!flash) {
        ctx.save();
        ctx.clip();
        const hl = x0 - 80;
        const hw = x1 - x0 + 160;
        const ht = Math.min(...ds.map((d) => d.y)) - 90;
        // riveted iron plates, tiled along her length (anchored to the keel so they line up whatever her length)
        if (has('gunship/hullplate')) {
          // (blended on twice: the hull colours are dark, so a single overlay barely shows the plates)
          overlayTile('gunship/hullplate', bp.hullColor, 2, x0 - 80, botY, hl, ht, hw, botY - ht + 4);
          ctx.fillStyle = 'rgba(190,110,90,.10)'; // a lift of warm light so the iron reads oxblood, not black
          ctx.fillRect(hl, ht, hw, botY - ht + 4);
        }
        paintPath(ctx, 'oxblood', 1);
        // painted shading: lit along the top edge, deep shadow toward the keel
        const gr = ctx.createLinearGradient(0, ht, 0, botY);
        gr.addColorStop(0, 'rgba(255,225,200,.10)');
        gr.addColorStop(0.35, 'rgba(0,0,0,0)');
        gr.addColorStop(0.7, 'rgba(14,6,8,.18)');
        gr.addColorStop(1, 'rgba(8,3,5,.45)');
        ctx.fillStyle = gr;
        ctx.fillRect(hl, ht, hw, botY - ht + 4);
        // charcoal trim: a heavy keel strake and a belt under the rail
        ctx.fillStyle = CHAR;
        ctx.fillRect(hl, botY - 22, hw, 22);
        paintRect(ctx, 'charcoal', hl, botY - 22, hw, 22);
        ctx.fillStyle = '#9a9086';
        for (let rv = x0 - 70; rv < x1 + 70; rv += 26) {
          ctx.beginPath();
          ctx.arc(rv, botY - 11, 2.4, 0, 7);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.fillRect(hl, botY - 24, hw, 3);
        ctx.restore();
        // Scorched, blackened patches along the hull when she is hurt (fixed places).
        if (hpF < 0.65) {
          const burn = clamp((0.65 - hpF) / 0.5, 0, 1);
          ctx.save();
          hullPath();
          ctx.clip();
          [[0.18, 0.5, 70], [0.55, 0.62, 90], [0.82, 0.45, 60], [0.38, 0.8, 55]].forEach(([u, v, r], si) => {
            if (si > 1 + burn * 3) return;
            const px = x0 + u * (x1 - x0);
            const py = ht + 60 + v * (botY - ht - 100);
            const gg = ctx.createRadialGradient(px, py, 2, px, py, r);
            gg.addColorStop(0, `rgba(10,6,6,${0.45 + 0.4 * burn})`);
            gg.addColorStop(1, 'rgba(10,6,6,0)');
            ctx.fillStyle = gg;
            ctx.fillRect(px - r, py - r, r * 2, r * 2);
          });
          ctx.restore();
        }
      }
      hullPath();
      ctx.stroke();
      // Flag-coloured stripe along the hull and the charcoal deck planks.
      ctx.fillStyle = flag.b;
      ctx.fillRect(x0 - 28, botY - 50, x1 - x0 + 56, 7);
      ctx.strokeRect(x0 - 28, botY - 50, x1 - x0 + 56, 7);
      ds.forEach((d, i) => {
        const l = d.x0 - (i === 0 ? 30 : 0);
        const r = d.x1 + (i === ds.length - 1 ? 30 : 0);
        ctx.fillStyle = flash ? '#ffffff' : '#2a272b';
        ctx.fillRect(l, d.y - 6, r - l, 16);
        if (!flash) {
          paintRect(ctx, 'charcoal', l, d.y - 6, r - l, 16, 1);
          ctx.fillStyle = 'rgba(255,235,215,.14)';
          ctx.fillRect(l, d.y - 6, r - l, 3);
          ctx.strokeStyle = 'rgba(8,6,8,.55)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(l, d.y + 2);
          ctx.lineTo(r, d.y + 2);
          for (let px = l + 18 + ((d.k || 0) * 7) % 11; px < r - 4; px += 38) {
            ctx.moveTo(px, d.y - 6);
            ctx.lineTo(px, d.y + 2);
            ctx.moveTo(px + 19, d.y + 2);
            ctx.lineTo(px + 19, d.y + 10);
          }
          ctx.stroke();
          ink();
          ctx.lineWidth = 3.2;
        }
        ctx.strokeRect(l, d.y - 6, r - l, 16);
      });
      // Portholes along the hull.
      ctx.fillStyle = '#e8c070';
      for (let k = 0; k < 9; k++) {
        const hx = x0 + 60 + k * ((x1 - x0 - 120) / 8);
        if (bp.special === 'hangar' && Math.abs(hx - bp.hangar.x) < 64) continue;
        ctx.beginPath();
        ctx.arc(hx, segAtC(bp, hx).y + 30, 8, 0, 7);
        ctx.fill();
        ctx.stroke();
      }
      ink();
      // Ladders at each step between her decks (with arrows while someone is aboard).
      for (let i = 0; i < ds.length - 1; i++) {
        const xb = ds[i].x1;
        const lowSide = ds[i].y > ds[i + 1].y ? -1 : 1; // which side of the step is the lower deck
        const yLow = Math.max(ds[i].y, ds[i + 1].y);
        const yHigh = Math.min(ds[i].y, ds[i + 1].y);
        const lx = xb + lowSide * 14;
        ctx.strokeStyle = '#b98a5a';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(lx - 7, yLow - 4);
        ctx.lineTo(lx - 7, yHigh - 70);
        ctx.moveTo(lx + 7, yLow - 4);
        ctx.lineTo(lx + 7, yHigh - 70);
        ctx.stroke();
        ctx.lineWidth = 3;
        for (let yy = yLow - 18; yy > yHigh - 66; yy -= 20) {
          ctx.beginPath();
          ctx.moveTo(lx - 7, yy);
          ctx.lineTo(lx + 7, yy);
          ctx.stroke();
        }
        if (crewAboard) {
          ctx.fillStyle = `rgba(255,210,63,${0.5 + 0.4 * Math.sin(time * 6)})`;
          ctx.beginPath();
          ctx.moveTo(lx, yLow - 120 - 8);
          ctx.lineTo(lx - 12, yLow - 100);
          ctx.lineTo(lx + 12, yLow - 100);
          ctx.closePath();
          ctx.fill();
        }
        ink();
      }
      // Hull damage: smoke, and fire when she is nearly done.
      if (hpF < 0.65) plume(time, cx - 150, topY, 4, 120, -60, 8, 30, '40,40,40', 0.55);
      if (hpF < 0.35) {
        plume(time + 0.3, cx + 260, topY, 4, 130, -50, 8, 32, '30,30,30', 0.6);
        ctx.fillStyle = `rgba(255,${120 + Math.sin(time * 20) * 40},40,.85)`;
        ctx.beginPath();
        ctx.ellipse(cx + 260, topY + 2, 22, 14 + Math.sin(time * 18) * 4, 0, Math.PI, 0);
        ctx.fill();
      }
      // Her weapons. A wrecked one is a smoking, blackened hole with a bent barrel. Stern cannon ports swing to the
      // end facing us when she turns, glowing before a broadside.
      const baseAng = Math.PI;
      bp.weapons.forEach((w, k) => {
        const pt = (g.ports && g.ports[k]) || {};
        const dead = !!pt.dead;
        const px = w.x;
        const py = w.y;
        if (w.kind === 'cannon') {
          const aimC = aimFrom(px, py);
          const glow = g.warnFire && !dead ? 0.5 + 0.5 * Math.sin(time * 30) : 0;
          // barrel first (it pokes out through the port), then the iron port ring over its root
          ctx.save();
          ctx.translate(px, py);
          const ang = dead ? 2.4 : baseAng + clamp(Math.atan2(Math.sin(aimC - baseAng), Math.cos(aimC - baseAng)), -1.5, 1.5);
          ctx.rotate(ang);
          ctx.fillStyle = dead ? '#2a2526' : '#4a4346';
          ctx.fillRect(0, -8, dead ? 32 : 60, 16);
          if (!dead) {
            ctx.fillStyle = 'rgba(255,235,215,.16)';
            ctx.fillRect(0, -8, 60, 4);
            ctx.fillStyle = 'rgba(8,4,6,.3)';
            ctx.fillRect(0, 3, 60, 5);
          }
          ctx.strokeRect(0, -8, dead ? 32 : 60, 16);
          ctx.restore();
          if (has('gunship/port')) {
            sprites.box(ctx, 'gunship/port', px - 24, py - 24, 48, 48);
            ctx.fillStyle = dead ? '#120d0d' : glow ? `rgba(255,${80 + 100 * (1 - glow)},60,1)` : '#2b2622';
            ctx.beginPath();
            ctx.arc(px, py, 9.5, 0, 7);
            ctx.fill();
          } else {
            ctx.fillStyle = dead ? '#120d0d' : glow ? `rgba(255,${80 + 100 * (1 - glow)},60,1)` : '#2b2622';
            ctx.beginPath();
            ctx.arc(px, py, 16, 0, 7);
            ctx.fill();
            ctx.stroke();
          }
          if (dead) {
            ctx.fillStyle = 'rgba(10,6,6,.55)';
            ctx.beginPath();
            ctx.arc(px, py, 22, 0, 7);
            ctx.fill();
          }
        } else if (w.kind === 'turret') {
          // A rotating dome on top of the gasbag: it fires over her bag, whichever way she faces.
          const ang = dead ? -0.6 : aimFrom(px, py);
          if (!has('gunship/dome')) ironPlate(px - 20, py + 2, 40, 14);
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(ang);
          ctx.fillStyle = dead ? '#2a2526' : pt.glow ? '#e8884a' : '#4a4346';
          ctx.fillRect(0, -6, dead ? 30 : 62, 12);
          if (!dead && !pt.glow) {
            ctx.fillStyle = 'rgba(255,235,215,.16)';
            ctx.fillRect(0, -6, 62, 3);
          }
          ctx.strokeRect(0, -6, dead ? 30 : 62, 12);
          ctx.restore();
          if (has('gunship/dome')) {
            sprites.box(ctx, 'gunship/dome', px - 24, py - 24, 48, 42);
            if (dead || pt.glow) {
              ctx.fillStyle = dead ? 'rgba(10,6,6,.78)' : 'rgba(255,106,64,.7)';
              ctx.beginPath();
              ctx.arc(px, py, 19, Math.PI, 0);
              ctx.closePath();
              ctx.fill();
            }
          } else {
            ctx.fillStyle = dead ? '#120d0d' : pt.glow ? '#ff6a40' : '#5a5a5a';
            ctx.beginPath();
            ctx.arc(px, py, 20, Math.PI, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        } else if (w.kind === 'mortar') {
          // A fat tube on the deck pointing up and back toward us, with a base plate.
          ironPlate(px - 30, py + 18, 60, 12);
          ctx.save();
          ctx.translate(px, py + 18);
          ctx.rotate(dead ? -0.3 : -Math.PI / 2 - 0.35);
          ctx.fillStyle = dead ? '#2a2526' : pt.glow ? '#e8884a' : '#4a4346';
          ctx.fillRect(0, -13, dead ? 30 : 60, 26);
          ctx.strokeRect(0, -13, dead ? 30 : 60, 26);
          ctx.fillStyle = dead ? '#120d0d' : '#2b2622';
          ctx.fillRect(dead ? 24 : 54, -10, 6, 20);
          ctx.restore();
        } else {
          // Flak gun on the nose: a cluster of three thin barrels with a ring sight.
          ironPlate(px - 24, py + 8, 48, 20);
          ctx.save();
          ctx.translate(px, py + 8);
          ctx.rotate(dead ? -0.2 : -0.9);
          ctx.fillStyle = dead ? '#2a2526' : pt.glow ? '#e8884a' : '#4a4346';
          for (const o of [-9, 0, 9]) {
            ctx.fillRect(0, o - 3.5, dead ? 24 : 54, 7);
            ctx.strokeRect(0, o - 3.5, dead ? 24 : 54, 7);
          }
          ctx.restore();
          ctx.fillStyle = dead ? '#120d0d' : '#5a5a5a';
          ctx.beginPath();
          ctx.arc(px, py + 8, 13, 0, 7);
          ctx.fill();
          ctx.stroke();
        }
        if (dead && Math.sin(time * 9 + k) > 0.2) {
          ctx.fillStyle = 'rgba(70,70,70,.55)';
          ctx.beginPath();
          ctx.arc(px - 10, py - 24 - ((time * 40 + k * 17) % 30), 9, 0, 7);
          ctx.fill();
        }
      });
      // ---- Special gear ----
      const sp = bp.special;
      if (sp === 'hangar') {
        // Bat hangar: a door in the hull flank that slides up to launch a swarm (glowing eyes inside).
        const h = bp.hangar;
        const open = g.hangarOpen > 0 ? Math.min(1, g.hangarOpen / 0.4, (1.6 - g.hangarOpen) / 0.3 + 0.2) : 0;
        ctx.fillStyle = '#120d0d';
        ctx.fillRect(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h);
        ctx.strokeRect(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h);
        if (open > 0.3) {
          ctx.fillStyle = '#f2d36b';
          for (const ex of [-18, 6, 26]) {
            ctx.beginPath();
            ctx.arc(h.x + ex, h.y + 6, 4, 0, 7);
            ctx.fill();
          }
        }
        const dh = h.h * (1 - 0.85 * open);
        ctx.fillStyle = '#3a2f4a';
        ctx.fillRect(h.x - h.w / 2, h.y - h.h / 2, h.w, dh);
        ctx.strokeRect(h.x - h.w / 2, h.y - h.h / 2, h.w, dh);
        ctx.strokeStyle = 'rgba(0,0,0,.35)';
        for (let yy = h.y - h.h / 2 + 12; yy < h.y - h.h / 2 + dh - 4; yy += 12) {
          ctx.beginPath();
          ctx.moveTo(h.x - h.w / 2 + 4, yy);
          ctx.lineTo(h.x + h.w / 2 - 4, yy);
          ctx.stroke();
        }
        ink();
        if (dh > 30) {
          // a bat badge on the door
          ctx.fillStyle = CREAM;
          ctx.beginPath();
          ctx.moveTo(h.x, h.y - 6);
          ctx.quadraticCurveTo(h.x - 14, h.y - 22, h.x - 30, h.y - 10);
          ctx.quadraticCurveTo(h.x - 20, h.y - 4, h.x - 14, h.y + 6);
          ctx.quadraticCurveTo(h.x - 6, h.y - 2, h.x, h.y + 8);
          ctx.quadraticCurveTo(h.x + 6, h.y - 2, h.x + 14, h.y + 6);
          ctx.quadraticCurveTo(h.x + 20, h.y - 4, h.x + 30, h.y - 10);
          ctx.quadraticCurveTo(h.x + 14, h.y - 22, h.x, h.y - 6);
          ctx.fill();
        }
      } else if (sp === 'ramp') {
        // Boarding ramp hinged at the stern: stowed upright, lowered toward our ship when she latches on.
        const r = bp.ramp;
        const ang = 4.712 - 1.74 * num(g.ramp);
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.rotate(ang);
        ctx.fillStyle = '#8a6444';
        ctx.fillRect(0, -7, 170, 14);
        ctx.strokeRect(0, -7, 170, 14);
        ctx.strokeStyle = 'rgba(0,0,0,.3)';
        for (let xx = 18; xx < 165; xx += 22) {
          ctx.beginPath();
          ctx.moveTo(xx, -7);
          ctx.lineTo(xx, 7);
          ctx.stroke();
        }
        ink();
        ctx.fillStyle = '#9a9a9a';
        ctx.beginPath();
        ctx.moveTo(170, -9);
        ctx.lineTo(188, 0);
        ctx.lineTo(170, 9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = '#4a4346';
        ctx.beginPath();
        ctx.arc(r.x, r.y, 9, 0, 7);
        ctx.fill();
        ctx.stroke();
      } else if (sp === 'harpoon') {
        // Harpoon gun on the stern rail: a mount, a long barrel with the harpoon head and a coil of rope.
        const hp = bp.harpoon;
        const fl = num(g.harpFlash);
        ctx.fillStyle = '#4a4346';
        ctx.fillRect(hp.x - 10, hp.y, 20, 36);
        ctx.strokeRect(hp.x - 10, hp.y, 20, 36);
        ctx.save();
        ctx.translate(hp.x, hp.y);
        ctx.rotate(Math.PI + 0.12);
        ctx.fillRect(-(fl > 0 ? 6 : 0), -7, 84, 14);
        ctx.strokeRect(-(fl > 0 ? 6 : 0), -7, 84, 14);
        ctx.fillStyle = '#c9c3b2';
        ctx.beginPath();
        ctx.moveTo(84, -10);
        ctx.lineTo(120, 0);
        ctx.lineTo(84, 10);
        ctx.closePath();
        if (fl <= 0) {
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
        ctx.fillStyle = '#d8c79a';
        ctx.beginPath();
        ctx.arc(hp.x + 30, hp.y + 14, 14, 0, 7);
        ctx.fill();
        ctx.stroke();
        if (fl > 0) {
          ctx.fillStyle = `rgba(255,220,120,${fl * 1.6})`;
          ctx.beginPath();
          ctx.arc(hp.x - 90, hp.y, 24 * fl * 2, 0, 7);
          ctx.fill();
        }
      } else if (sp === 'paras') {
        // A rack of parachute packs on the stern wall.
        const rk = bp.rack;
        ctx.fillStyle = '#6b4a32';
        ctx.fillRect(rk.x - 44, rk.y - 4, 88, 8);
        ctx.strokeRect(rk.x - 44, rk.y - 4, 88, 8);
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = i % 2 ? CREAM : flag.a;
          ctx.beginPath();
          ctx.roundRect(rk.x - 40 + i * 28, rk.y + 4, 24, 38, 8);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(rk.x - 28 + i * 28, rk.y + 4);
          ctx.lineTo(rk.x - 28 + i * 28, rk.y + 42);
          ctx.stroke();
        }
      }
      // Boiler (the target) with the charge, a steam gauge and a smokestack. An ARMOURED boiler has heavy plates and rivets.
      const bx = bp.boilerX;
      const by = segAtC(bp, bx).y;
      ctx.fillStyle = '#5a5a5a';
      ctx.fillRect(bx - 50, by - 110, 100, 104);
      ctx.strokeRect(bx - 50, by - 110, 100, 104);
      ctx.fillStyle = '#4a4346';
      ctx.fillRect(bx + 14, by - 180, 26, 70); // stack
      ctx.strokeRect(bx + 14, by - 180, 26, 70);
      ctx.fillRect(bx + 8, by - 190, 38, 12);
      ctx.strokeRect(bx + 8, by - 190, 38, 12);
      if (steam > 0.08) plume(time, bx + 27, by - 192, 5, 130, -70 - Math.abs(num(g.wvx)) * 0.08, 8, 26, '70,66,68', 0.25 + 0.4 * steam);
      ctx.fillStyle = `rgba(255,120,40,${(0.15 + 0.7 * steam) * (0.85 + 0.15 * Math.sin(time * 6))})`;
      ctx.beginPath();
      ctx.arc(bx - 14, by - 40, 20, 0, 7);
      ctx.fill();
      ctx.stroke();
      if (sp === 'armoured') {
        ctx.fillStyle = '#3d3d44';
        ctx.fillRect(bx - 62, by - 120, 124, 22);
        ctx.strokeRect(bx - 62, by - 120, 124, 22);
        ctx.fillRect(bx - 62, by - 30, 124, 24);
        ctx.strokeRect(bx - 62, by - 30, 124, 24);
        ctx.fillRect(bx - 62, by - 98, 14, 68);
        ctx.strokeRect(bx - 62, by - 98, 14, 68);
        ctx.fillRect(bx + 48, by - 98, 14, 68);
        ctx.strokeRect(bx + 48, by - 98, 14, 68);
        ctx.fillStyle = '#9a9a9a';
        for (let i = 0; i < 6; i++) {
          ctx.beginPath();
          ctx.arc(bx - 52 + i * 21, by - 109, 3.5, 0, 7);
          ctx.arc(bx - 52 + i * 21, by - 18, 3.5, 0, 7);
          ctx.fill();
        }
      }
      // pressure gauge
      ctx.fillStyle = CREAM;
      ctx.beginPath();
      ctx.arc(bx - 14, by - 86, 14, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx - 14, by - 86);
      const na = Math.PI * (0.85 + 1.3 * steam);
      ctx.lineTo(bx - 14 + Math.cos(na) * 11, by - 86 + Math.sin(na) * 11);
      ctx.stroke();
      if (g.charge) {
        const blink = Math.sin(time * (8 + (10 - g.charge.t) * 3)) > 0;
        ctx.fillStyle = blink ? '#ff2e55' : '#f2d36b';
        ctx.beginPath();
        ctx.arc(bx + 40, by - 120, 22, 0, 7);
        ctx.fill();
        ctx.stroke();
      } else if (g.rope) {
        // A big arrow so boarders know where to go.
        ctx.fillStyle = `rgba(255,210,63,${0.6 + 0.4 * Math.sin(time * 6)})`;
        ctx.beginPath();
        ctx.moveTo(bx, by - 130);
        ctx.lineTo(bx - 30, by - 190);
        ctx.lineTo(bx + 30, by - 190);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // Her helm wheel: turns as her helmsman steers (spins free with nobody on it).
      const hx = bp.posts.helm[0] + 40;
      const hy = segAtC(bp, hx).y;
      ink();
      ctx.lineWidth = 3;
      ctx.fillStyle = '#8a6a44';
      ctx.fillRect(hx - 6, hy - 60, 12, 54);
      ctx.strokeRect(hx - 6, hy - 60, 12, 54);
      ctx.save();
      ctx.translate(hx, hy - 78);
      ctx.rotate(g.posts && !g.posts.helm ? time * 4 : num(g.wheel) + Math.sin(time) * 0.1);
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, 7);
      ctx.stroke();
      for (let k = 0; k < 4; k++) {
        ctx.rotate(Math.PI / 4);
        ctx.beginPath();
        ctx.moveTo(-34, 0);
        ctx.lineTo(34, 0);
        ctx.stroke();
      }
      ctx.restore();
      // Engines: one to three pods (flank-mounted or hung under the belly) with propellers at the stern end.
      bp.engines.forEach((pod, i) => {
        const e = (g.eng && g.eng[i]) || { hp: 1 };
        ink();
        ctx.lineWidth = 3;
        if (pod.y > botY - 20) {
          // belly pod: hung from the hull on a strut
          ctx.fillStyle = '#3a3438';
          ctx.fillRect(pod.x - 6, botY - 14, 12, 40);
          ctx.strokeRect(pod.x - 6, botY - 14, 12, 40);
        }
        ctx.save();
        ctx.translate(pod.x, pod.y);
        ctx.scale(pod.s, pod.s);
        if (has('gunship/engine')) {
          // painted iron nacelle: oxblood band, riveted cowl, exhaust stack (the prop is still drawn below)
          sprites.box(ctx, 'gunship/engine', -44, -40, 92, 64);
        } else {
          ctx.fillStyle = '#4a4346';
          ctx.beginPath();
          ctx.roundRect(-36, -20, 78, 40, 14);
          ctx.fill();
          paintPath(ctx, 'charcoal', 1);
          ctx.stroke();
          ctx.fillStyle = '#2b2622';
          ctx.fillRect(-6, -34, 14, 16); // exhaust stack
          ctx.strokeRect(-6, -34, 14, 16);
        }
        if (e.hp < 0.5) {
          // scorched: soot over the nacelle
          ctx.fillStyle = `rgba(10,6,6,${0.35 + 0.3 * (0.5 - e.hp) * 2})`;
          ctx.beginPath();
          ctx.roundRect(-34, -18, 74, 36, 13);
          ctx.fill();
        }
        const sputter = num(g.sput) > 0;
        const px0 = -50;
        const R = 46;
        const a = num(g.props && g.props[i]);
        const fast = Math.abs(thr) * (sputter ? 0.35 : 1);
        if (fast > 0.35) {
          ctx.fillStyle = `rgba(235,223,192,${0.12 + 0.12 * fast})`;
          ctx.beginPath();
          ctx.ellipse(px0, 0, 8, R, 0, 0, 7);
          ctx.fill();
        }
        ctx.strokeStyle = '#d6cdb8';
        ctx.lineWidth = 5;
        for (let b = 0; b < 3; b++) {
          const t = a + (b * Math.PI * 2) / 3;
          ctx.beginPath();
          ctx.moveTo(px0, 0);
          ctx.lineTo(px0 + Math.cos(t) * 5, Math.sin(t) * R * (0.6 + 0.4 * Math.abs(Math.cos(t * 0.5))));
          ctx.stroke();
        }
        ink();
        ctx.fillStyle = '#2b2622';
        ctx.beginPath();
        ctx.arc(px0, 0, 7, 0, 7);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        // exhaust puffs scale with the throttle; coughing black when damaged; smoke and flames when hurt
        const ex = pod.x;
        const ey = pod.y;
        if (steam > 0.05 && Math.abs(thr) > 0.15) plume(time + i * 0.4, ex + 1, ey - 36 * pod.s, 3, 40, 60 + 90 * Math.abs(thr), 5, 14, sputter ? '30,30,30' : '170,170,170', 0.2 + 0.3 * Math.abs(thr));
        if (e.hp < 0.5) plume(time + i * 0.3, ex + 20, ey - 20, 4, 90, 40, 6, 22, '30,30,30', 0.55);
        if (e.hp < 0.25 || sputter) {
          ctx.fillStyle = `rgba(255,${110 + Math.sin(time * 25) * 50},40,.85)`;
          ctx.beginPath();
          ctx.ellipse(ex + 30 * pod.s, ey - 2, 12 + Math.sin(time * 22) * 4, 8, 0, 0, 7);
          ctx.fill();
        }
      });
      // Mast on top of the bag with the intent pennant (her own flag).
      if (g.phase !== 'sinking') drawPennant(g, time, bp.mast.x, bp.mast.y);
    };

    // ---- Her crew, in their real (already mirrored) places on the deck ----
    const drawCrew = () => {
      for (const c of g.crew) {
        const px = num(c.x);
        const y = num(c.y, bp.decks[0].y);
        const face = c.face < 0 ? -1 : 1;
        const hit = c.wind > 0;
        const devil = c.role === 'gunner' || c.role === 'stoker' || (Math.round(num(c.post)) >> 3) % 3 === 0;
        const skin = hit ? '#ffffff' : devil ? '#a8443f' : BONE;
        const coat = hit ? '#ffffff' : OXB;
        const dark = hit ? '#ffffff' : CHAR;
        // thin brown ink, like the raiders
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2.2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        // the arm behind the body: bone, with the tool in the hand
        const armTo = () => {
          if (hit) return [px + face * 10, y - 120, 'up'];
          if (c.hammer) {
            const sw = Math.sin(time * 14 + px);
            return [px + face * (30 + 20 * sw), y - 50 + 30 * sw, 'hammer'];
          }
          if (c.role === 'stoker' && Math.abs(num(c.x) - num(c.post)) < 25) {
            const sw = Math.sin(time * 6 + px);
            return [px + face * (50 + 10 * sw), y - 30 - 20 * sw, 'shovel'];
          }
          return [px + face * 60, y - 70, 'ram'];
        };
        const [ax, ay, tool] = armTo();
        // legs and boots
        for (const s of [-1, 1]) {
          ctx.fillStyle = dark;
          ctx.beginPath();
          ctx.roundRect(px + s * 8 - 5, y - 30, 10, 24, 3);
          ctx.fill();
          ctx.stroke();
        }
        ctx.fillStyle = hit ? '#ffffff' : '#241f22';
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.roundRect(px + s * 8 - 6 + face * 2, y - 11, 13, 9, 3);
          ctx.fill();
          ctx.stroke();
        }
        // the working arm (a bone-coloured sleeve end) and its tool
        ctx.strokeStyle = INK;
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(px + face * 10, y - 60);
        ctx.lineTo(ax, ay);
        ctx.stroke();
        ctx.strokeStyle = hit ? '#ffffff' : coat;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(px + face * 10, y - 60);
        ctx.lineTo(ax, ay);
        ctx.stroke();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2.2;
        if (tool === 'hammer') {
          ctx.fillStyle = '#4a4346';
          ctx.fillRect(ax - 9, ay - 10, 18, 12);
          ctx.strokeRect(ax - 9, ay - 10, 18, 12);
        } else if (tool === 'shovel') {
          ctx.fillStyle = '#4a4346';
          ctx.beginPath();
          ctx.roundRect(ax - 8, ay - 6, 16, 12, 3);
          ctx.fill();
          ctx.stroke();
        } else if (tool === 'ram' && c.role === 'gunner') {
          ctx.strokeStyle = '#8a6444';
          ctx.lineWidth = 3.4;
          ctx.beginPath();
          ctx.moveTo(ax - face * 14, ay);
          ctx.lineTo(ax + face * 24, ay - 6);
          ctx.stroke();
          ctx.strokeStyle = INK;
          ctx.lineWidth = 2.2;
        }
        // torso: oxblood coat, charcoal belt, a sash in her trim colour
        ctx.fillStyle = coat;
        ctx.beginPath();
        ctx.roundRect(px - 16, y - 72, 32, 46, 8);
        ctx.fill();
        if (!hit) paintPath(ctx, 'oxblood', 1);
        ctx.stroke();
        if (!hit) {
          ctx.fillStyle = flag.b;
          ctx.beginPath();
          ctx.moveTo(px - 16, y - 66);
          ctx.lineTo(px - 6, y - 72);
          ctx.lineTo(px + 16, y - 36);
          ctx.lineTo(px + 6, y - 32);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = dark;
          ctx.fillRect(px - 16, y - 36, 32, 8);
          ctx.strokeRect(px - 16, y - 36, 32, 8);
          ctx.fillStyle = '#c9a85a';
          ctx.fillRect(px - 3, y - 35, 6, 6);
        }
        // head: horns for devils, a skull for the rest
        if (devil && !hit) {
          ctx.fillStyle = dark;
          for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(px + s * 8, y - 100);
            ctx.quadraticCurveTo(px + s * 22, y - 106, px + s * 18, y - 126);
            ctx.quadraticCurveTo(px + s * 13, y - 112, px + s * 3, y - 103);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        }
        ctx.fillStyle = skin;
        ctx.beginPath();
        ctx.arc(px, y - 88, 17, 0, 7);
        ctx.fill();
        if (!hit) paintPath(ctx, 'canvas', 0.6);
        ctx.stroke();
        if (!hit) {
          ctx.fillStyle = '#1e1a1c';
          for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(px + s * 6.5 + face * 2, y - 91, 4.4, devil ? 3.2 : 5, devil ? s * 0.4 : 0, 0, 7);
            ctx.fill();
          }
          if (devil) {
            ctx.fillStyle = '#f2d36b';
            for (const s of [-1, 1]) {
              ctx.beginPath();
              ctx.arc(px + s * 6.5 + face * 2, y - 91, 1.5, 0, 7);
              ctx.fill();
            }
          }
          // nose slit and grin
          ctx.beginPath();
          ctx.moveTo(px + face * 3, y - 86);
          ctx.lineTo(px + face * 1, y - 82);
          ctx.moveTo(px - 8, y - 78);
          ctx.lineTo(px + 8, y - 78);
          ctx.stroke();
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          for (let t = -6; t <= 6; t += 4) {
            ctx.moveTo(px + t, y - 79);
            ctx.lineTo(px + t, y - 76);
          }
          ctx.stroke();
          ctx.lineWidth = 2.2;
        }
        // what they do, at a glance: helmsman's cap, gunner's iron helm, stoker's soot and bandana
        if (!hit) {
          if (c.role === 'helm') {
            ctx.fillStyle = dark;
            ctx.beginPath();
            ctx.roundRect(px - 18, y - 108, 36, 12, 4);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = flag.b;
            ctx.fillRect(px - 18, y - 99, 36, 3);
            ctx.fillStyle = dark;
            ctx.fillRect(px - 8 + face * 8, y - 97, 22, 3);
          } else if (c.role === 'gunner') {
            ctx.fillStyle = '#4a4346';
            ctx.beginPath();
            ctx.arc(px, y - 92, 18, Math.PI * 1.05, Math.PI * 1.95);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          } else if (c.role === 'stoker') {
            ctx.fillStyle = 'rgba(20,12,12,.45)';
            ctx.beginPath();
            ctx.ellipse(px - 4, y - 80, 9, 5, 0, 0, 7);
            ctx.fill();
            ctx.fillStyle = OXB;
            ctx.fillRect(px - 17, y - 102, 34, 8);
            ctx.strokeRect(px - 17, y - 102, 34, 8);
          }
        }
        ink();
        ctx.lineWidth = 3.2;
        for (let k = 0; k < c.hp; k++) {
          ctx.fillStyle = '#a8443f';
          ctx.fillRect(px - 18 + k * 13, y - 140, 9, 9);
        }
      }
    };

    // ---- Put her together ----
    ctx.save();
    ctx.translate(dx, dy);
    if (far < 1) {
      ctx.translate(cx, pivotY);
      ctx.scale(far, far);
      ctx.translate(-cx, -pivotY);
    }
    ctx.save();
    ctx.translate(cx, botY - 112 + sink);
    if (sink) ctx.rotate(g.sink * 0.15);
    else ctx.rotate(-num(g.pitch) * sx); // nose up in a climb, nose down in a dive (flips with her facing)
    ctx.translate(-cx, -(botY - 112));
    // airframe: mirrored by her facing, squashed through zero while she turns
    ctx.save();
    ctx.translate(cx, 0);
    ctx.scale(sx === 0 ? 0.001 : sx, 1);
    ctx.translate(-cx, 0);
    drawAirframe();
    ctx.restore();
    // crew: same squash (their positions were mirrored at the middle of the turn)
    ctx.save();
    ctx.translate(cx, 0);
    ctx.scale(Math.max(0.001, sq), 1);
    ctx.translate(-cx, 0);
    drawCrew();
    ctx.restore();
    ctx.restore();
    // Name, health bar over the gasbag, and her systems: lit while working, dark and crossed out when you've knocked them out.
    if (g.phase !== 'sinking' && far >= 0.99) {
      const by = bp.bagTop - 30;
      ink();
      ctx.lineWidth = 5;
      ctx.font = '23px ' + config.FONTS.DISPLAY;
      ctx.textAlign = 'center';
      ctx.strokeText(bp.title, cx, by - 10);
      ctx.fillStyle = flag.b;
      ctx.fillText(bp.title, cx, by - 10);
      ctx.font = '700 17px ' + config.FONTS.TEXT;
      ctx.lineWidth = 4;
      const sub = bp.hull.toUpperCase() + ' - ' + bp.personality.toUpperCase() + (bp.special ? ' - ' + { hangar: 'BAT HANGAR', ramp: 'BOARDING RAMP', harpoon: 'HARPOON GUN', armoured: 'ARMOURED BOILER', paras: 'PARATROOPERS' }[bp.special] : '');
      ctx.strokeText(sub, cx, by + 52 + 40);
      ctx.fillStyle = CREAM;
      ctx.fillText(sub, cx, by + 52 + 40);
      ink();
      ctx.lineWidth = 3;
      ctx.fillStyle = '#2b2622';
      ctx.fillRect(cx - 200, by, 400, 22);
      ctx.fillStyle = flag.a;
      ctx.fillRect(cx - 196, by + 4, 392 * Math.max(0, g.hp / g.max), 14);
      if (g.posts) {
        const portsUp = g.ports ? g.ports.filter((q) => !q.dead).length : bp.weapons.length;
        const engOk = num(g.engF, 1) > 0.5;
        const items = [['GUNS ' + portsUp + '/' + bp.weapons.length, g.posts.guns > 0 && portsUp > 0], ['STEAM', g.posts.steam], ['HELM', g.posts.helm], ['ENGINES', engOk]];
        ctx.font = '20px ' + config.FONTS.DISPLAY;
        ctx.textAlign = 'center';
        items.forEach(([name, on], i) => {
          const tx = cx - 225 + i * 150;
          ctx.fillStyle = on ? '#f2d36b' : 'rgba(255,255,255,.35)';
          ctx.fillText(name, tx, by + 54);
          if (!on) {
            ctx.strokeStyle = '#a8443f';
            ctx.lineWidth = 2.8;
            ctx.beginPath();
            ctx.moveTo(tx - 44, by + 46);
            ctx.lineTo(tx + 44, by + 38);
            ctx.stroke();
          }
        });
        ink();
      }
      if (g.charge) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '31px ' + config.FONTS.DISPLAY;
        ctx.textAlign = 'center';
        ctx.fillText(Math.ceil(g.charge.t), mx(g, bp.boilerX + 40), segAtC(bp, bp.boilerX).y - 150);
      }
    }
    ctx.restore();
    drawRope();
  }
}
