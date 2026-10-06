// Drawing for an enemy gunship (ship coordinates - drawn inside the ship's transform). She is drawn
// in her own home frame, shifted to wherever she is now (g.dx, g.dy). Everything on her shows what her
// systems are doing (see gunship.js):
//   - GASBAG swells and sags with g.gas (slack wrinkles when it's low)
//   - two ENGINES with propellers that spin with the throttle, cough when damaged and smoke when hurt
//   - BOILER with a smokestack that feeds off g.steam (cold boiler = no smoke, dim fire)
//   - HELM wheel that turns as the helmsman steers
//   - she pitches nose-up / nose-down in climbs and dives
//   - TURNING ROUND: the airframe squashes through the middle (scale through zero) and comes out mirrored;
//     g.m is the facing (+1 nose right, -1 nose left), her crew are drawn at their own (already mirrored) places
//   - a PENNANT on a mast shows what her captain intends: crossed swords = attack, swords + dashes = strafing run,
//     arrow back = withdrawing, hammer = repairing, hook = latching on, up-arrow + chute = climbing to drop
//     paratroopers, chevrons = closing in. Far off on her way in she is drawn smaller (a shape on the horizon).
// Also: her crew, the grapple rope to our bow (sagging when slack, straight when taut), the swing line,
// and the charge ticking on her boiler. Style 2026: enemy oxblood + charcoal, thin outlines.
import { GS, POSTS, ANCHOR, BOW, mx } from './gunship.js';
import { config } from '../../config.js';

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const report = (e) => {
  const list = (globalThis.gameErrors = globalThis.gameErrors || []);
  if (list.length < 50) list.push('gunship art: ' + (e && e.message));
};
const BAG = '#5a3a40';
const HULL = '#4a2626';
const CREAM = '#ebdfc0';

export function createGunshipArt({ ctx, state, ink }) {
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

  // The intent pennant on her mast (canonical frame, mast foot at (mx0, my0)).
  const drawPennant = (g, time, mx0, my0) => {
    const intent = g.intent || 'attack';
    const col = { attack: '#a8443f', strafe: '#a8443f', climb: '#c9706a', latch: '#8a6444', retreat: '#4a4346', flee: '#4a4346', approach: '#4a4346' }[intent] || '#a8443f';
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
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    for (let k = 1; k <= 8; k++) ctx.lineTo(fx + (W * k) / 8, fy + wav(k / 8));
    ctx.lineTo(fx + W, fy + H * 0.5 + wav(1));
    ctx.lineTo(fx + W - 18, fy + H * 0.5 + wav(1) * 0.7); // swallow-tail
    ctx.lineTo(fx + W, fy + H + wav(1));
    for (let k = 7; k >= 0; k--) ctx.lineTo(fx + (W * k) / 8, fy + H + wav(k / 8));
    ctx.closePath();
    ctx.fill();
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
    if (!g) return;
    try {
      drawGunship(g, time);
    } catch (e) {
      report(e);
    }
  };

  function drawGunship(g, time) {
    const GC = config.GUNSHIP;
    const dx = num(g.dx);
    const dy = num(g.dy);
    const m = g.m < 0 ? -1 : 1;
    const sink = g.phase === 'sinking' ? g.sink * g.sink * 120 : 0;
    const x0 = GS.x0;
    const x1 = GS.x1;
    const y = GS.deckY + sink;
    const cx = (x0 + x1) / 2;
    const gas = clamp(num(g.gas, 0.5), 0, 1);
    const hpF = clamp(num(g.hp, 1) / Math.max(1, num(g.max, 1)), 0, 1);
    const tk = g.turn ? Math.min(1, num(g.turn.t) / GC.TURN_TIME) : 0;
    const sq = g.turn ? Math.abs(Math.cos(Math.PI * tk)) : 1; // squash while she turns round
    const sx = m * sq;
    const far = clamp(1 - (Math.abs(dx) - 2200) / 5000, 0.5, 1); // a small shape on the horizon until she is close
    const thr = num(g.thr);
    const steam = clamp(num(g.steam, 0.8), 0, 1);

    // The rope and swing line are drawn in ship coordinates, after her own transform is undone.
    const drawRope = () => {
      if (!g.rope) return;
      const ax = mx(g, ANCHOR.x) + dx;
      const ay = ANCHOR.y + dy + sink;
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
          const yy = 330 + k * 85 + Math.sin(time * 7 + k) * 8;
          const off = (time * 900 + k * 130) % 260;
          ctx.beginPath();
          ctx.moveTo(x0 - 120 - off, yy);
          ctx.lineTo(x0 - 120 - off - 90, yy);
          ctx.stroke();
        }
        ink();
      }
      // Gasbag: swells with the gas, goes slack when it is low.
      const rx = 660 * (0.97 + 0.03 * gas);
      const ry = 160 * (0.78 + 0.22 * gas);
      ctx.lineWidth = 3.2;
      ctx.fillStyle = flash ? '#ffffff' : BAG;
      ctx.beginPath();
      ctx.ellipse(cx, 380, rx, ry, 0, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.12)';
      ctx.lineWidth = 3;
      for (let k = -4; k <= 4; k++) {
        ctx.beginPath();
        ctx.ellipse(cx, 380, Math.abs(k) * 150 + 10, ry, 0, k < 0 ? Math.PI / 2 : -Math.PI / 2, k < 0 ? Math.PI * 1.5 : Math.PI / 2);
        ctx.stroke();
      }
      if (gas < 0.45) {
        // slack fabric: wrinkles across the lower bag
        ctx.strokeStyle = 'rgba(0,0,0,.28)';
        ctx.lineWidth = 3;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.moveTo(cx - 330 + k * 40, 380 + ry * 0.35);
          ctx.quadraticCurveTo(cx - 100 + k * 120, 380 + ry * (0.7 - k * 0.1) + Math.sin(time * 2 + k) * 4, cx + 330 - k * 40, 380 + ry * 0.35);
          ctx.stroke();
        }
      }
      // Tail fins at the stern end of the bag.
      ink();
      ctx.lineWidth = 3;
      ctx.fillStyle = flash ? '#ffffff' : '#3a2a30';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx - 520, 380 + s * (ry * 0.62));
        ctx.lineTo(cx - 640, 380 + s * (ry * 0.2 + 26));
        ctx.lineTo(cx - 600, 380 + s * (ry * 0.62));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // Horns emblem.
      ctx.fillStyle = '#a8443f';
      ctx.beginPath();
      ctx.arc(cx, 380, 60 * (0.8 + 0.2 * gas), 0, 7);
      ctx.fill();
      ctx.fillStyle = '#2b2622';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 22, 410);
        ctx.quadraticCurveTo(cx + s * 40, 350, cx + s * 10, 340);
        ctx.quadraticCurveTo(cx + s * 18, 375, cx + s * 6, 405);
        ctx.fill();
      }
      // Gas leaking from a holed bag (hurt, or nobody tending it).
      if (hpF < 0.5 || (g.posts && !g.posts.helm)) plume(time, cx + 120, 250, 3, 60, -40, 5, 16, '200,200,200', 0.35);
      // Rigging.
      ink();
      ctx.lineWidth = 3;
      for (let k = 0; k < 5; k++) {
        const rxk = x0 + 100 + k * ((x1 - x0 - 200) / 4);
        ctx.beginPath();
        ctx.moveTo(rxk, 380 + ry * 0.9);
        ctx.lineTo(rxk + 20 * m * 0, y - 80);
        ctx.stroke();
      }
      // Yardarm sticking out toward us (the hookshot catches it), at the stern end.
      const ax = ANCHOR.x;
      const ay = ANCHOR.y + sink;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(x0 + 120, ay + 40);
      ctx.lineTo(ax, ay);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(x0 + 160, 520);
      ctx.stroke();
      // Hull (symmetrical).
      ctx.lineWidth = 3.2;
      ctx.fillStyle = flash ? '#ffffff' : HULL;
      ctx.beginPath();
      ctx.moveTo(x0 - 75, y - 80);
      ctx.lineTo(x1 + 75, y - 80);
      ctx.lineTo(x1 + 30, y + 112);
      ctx.lineTo(x0 - 30, y + 112);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#2a1616';
      ctx.fillRect(x0 - 30, y - 6, x1 - x0 + 60, 16); // deck
      ctx.strokeRect(x0 - 30, y - 6, x1 - x0 + 60, 16);
      // Portholes along the hull and a plank seam.
      ctx.fillStyle = '#e8c070';
      for (let k = 0; k < 9; k++) {
        ctx.beginPath();
        ctx.arc(x0 + 60 + k * ((x1 - x0 - 120) / 8), y + 30, 8, 0, 7);
        ctx.fill();
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath();
      ctx.moveTo(x0 - 40, y + 70);
      ctx.lineTo(x1 + 40, y + 70);
      ctx.stroke();
      ink();
      // Hull damage: smoke, and fire when she is nearly done.
      if (hpF < 0.65) plume(time, cx - 150, y - 80, 4, 120, -60, 8, 30, '40,40,40', 0.55);
      if (hpF < 0.35) {
        plume(time + 0.3, cx + 260, y - 80, 4, 130, -50, 8, 32, '30,30,30', 0.6);
        ctx.fillStyle = `rgba(255,${120 + Math.sin(time * 20) * 40},40,.85)`;
        ctx.beginPath();
        ctx.ellipse(cx + 260, y - 78, 22, 14 + Math.sin(time * 18) * 4, 0, Math.PI, 0);
        ctx.fill();
      }
      // Gun ports on the stern end (they swing to the end facing us when she turns), glowing before a
      // broadside. A wrecked port is a smoking, blackened hole with a bent barrel.
      const px = x0 - 30;
      const baseAng = Math.PI;
      const aimW = typeof g.aim === 'number' ? g.aim : Math.PI;
      const aimC = m > 0 ? aimW : Math.PI - aimW; // world angle to canonical frame (mirrored when facing left)
      for (let k = 0; k < 3; k++) {
        const py = y - 80 + 40 + k * 70;
        const dead = g.ports && g.ports[k] && g.ports[k].dead;
        const glow = g.warnFire && !dead ? 0.5 + 0.5 * Math.sin(time * 30) : 0;
        ctx.fillStyle = dead ? '#120d0d' : glow ? `rgba(255,${80 + 100 * (1 - glow)},60,1)` : '#2b2622';
        ctx.beginPath();
        ctx.arc(px, py, 16, 0, 7);
        ctx.fill();
        ctx.stroke();
        ctx.save();
        ctx.translate(px, py);
        const ang = dead ? 2.4 : baseAng + clamp(Math.atan2(Math.sin(aimC - baseAng), Math.cos(aimC - baseAng)), -1.5, 1.5);
        ctx.rotate(ang);
        ctx.fillStyle = dead ? '#2a2526' : '#4a4346';
        ctx.fillRect(0, -8, dead ? 32 : 60, 16);
        ctx.strokeRect(0, -8, dead ? 32 : 60, 16);
        ctx.restore();
        if (dead && Math.sin(time * 9 + k) > 0.2) {
          ctx.fillStyle = 'rgba(70,70,70,.55)';
          ctx.beginPath();
          ctx.arc(px - 10, py - 24 - ((time * 40 + k * 17) % 30), 9, 0, 7);
          ctx.fill();
        }
      }
      // Boiler (the target) with the charge, a steam gauge and a smokestack.
      const bx = GS.boilerX;
      ctx.fillStyle = '#5a5a5a';
      ctx.fillRect(bx - 50, y - 110, 100, 104);
      ctx.strokeRect(bx - 50, y - 110, 100, 104);
      ctx.fillStyle = '#4a4346';
      ctx.fillRect(bx + 14, y - 180, 26, 70); // stack
      ctx.strokeRect(bx + 14, y - 180, 26, 70);
      ctx.fillRect(bx + 8, y - 190, 38, 12);
      ctx.strokeRect(bx + 8, y - 190, 38, 12);
      if (steam > 0.08) plume(time, bx + 27, y - 192, 5, 130, -70 - Math.abs(num(g.wvx)) * 0.08, 8, 26, '70,66,68', 0.25 + 0.4 * steam);
      ctx.fillStyle = `rgba(255,120,40,${(0.15 + 0.7 * steam) * (0.85 + 0.15 * Math.sin(time * 6))})`;
      ctx.beginPath();
      ctx.arc(bx - 14, y - 40, 20, 0, 7);
      ctx.fill();
      ctx.stroke();
      // pressure gauge
      ctx.fillStyle = CREAM;
      ctx.beginPath();
      ctx.arc(bx - 14, y - 86, 14, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx - 14, y - 86);
      const na = Math.PI * (0.85 + 1.3 * steam);
      ctx.lineTo(bx - 14 + Math.cos(na) * 11, y - 86 + Math.sin(na) * 11);
      ctx.stroke();
      if (g.charge) {
        const blink = Math.sin(time * (8 + (10 - g.charge.t) * 3)) > 0;
        ctx.fillStyle = blink ? '#ff2e55' : '#f2d36b';
        ctx.beginPath();
        ctx.arc(bx + 40, y - 120, 22, 0, 7);
        ctx.fill();
        ctx.stroke();
      } else if (g.rope) {
        // A big arrow so boarders know where to go.
        ctx.fillStyle = `rgba(255,210,63,${0.6 + 0.4 * Math.sin(time * 6)})`;
        ctx.beginPath();
        ctx.moveTo(bx, y - 130);
        ctx.lineTo(bx - 30, y - 190);
        ctx.lineTo(bx + 30, y - 190);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // Her helm wheel: turns as her helmsman steers (spins free with nobody on it).
      const hx = POSTS.helm[0] + 40;
      ink();
      ctx.lineWidth = 3;
      ctx.fillStyle = '#8a6a44';
      ctx.fillRect(hx - 6, y - 60, 12, 54);
      ctx.strokeRect(hx - 6, y - 60, 12, 54);
      ctx.save();
      ctx.translate(hx, y - 78);
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
      // Engines: two pods on the hull flank with propellers at the stern end.
      const engX = [x0 + 250, x0 + 480];
      for (let i = 0; i < 2; i++) {
        const e = (g.eng && g.eng[i]) || { hp: 1 };
        const ex = engX[i];
        const ey = y + 72;
        ink();
        ctx.lineWidth = 3;
        ctx.fillStyle = '#4a4346';
        ctx.beginPath();
        ctx.roundRect(ex - 36, ey - 20, 78, 40, 14);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#2b2622';
        ctx.fillRect(ex - 6, ey - 34, 14, 16); // exhaust stack
        ctx.strokeRect(ex - 6, ey - 34, 14, 16);
        const sputter = num(g.sput) > 0;
        const px0 = ex - 50;
        const R = 46;
        const a = num(g.props && g.props[i]);
        const fast = Math.abs(thr) * (sputter ? 0.35 : 1);
        if (fast > 0.35) {
          ctx.fillStyle = `rgba(235,223,192,${0.12 + 0.12 * fast})`;
          ctx.beginPath();
          ctx.ellipse(px0, ey, 8, R, 0, 0, 7);
          ctx.fill();
        }
        ctx.strokeStyle = '#d6cdb8';
        ctx.lineWidth = 5;
        for (let b = 0; b < 3; b++) {
          const t = a + (b * Math.PI * 2) / 3;
          ctx.beginPath();
          ctx.moveTo(px0, ey);
          ctx.lineTo(px0 + Math.cos(t) * 5, ey + Math.sin(t) * R * (0.6 + 0.4 * Math.abs(Math.cos(t * 0.5))));
          ctx.stroke();
        }
        ink();
        ctx.fillStyle = '#2b2622';
        ctx.beginPath();
        ctx.arc(px0, ey, 7, 0, 7);
        ctx.fill();
        ctx.stroke();
        // exhaust puffs scale with the throttle; coughing black when damaged; smoke and flames when hurt
        if (steam > 0.05 && Math.abs(thr) > 0.15) plume(time + i * 0.4, ex + 1, ey - 36, 3, 40, 60 + 90 * Math.abs(thr), 5, 14, sputter ? '30,30,30' : '170,170,170', 0.2 + 0.3 * Math.abs(thr));
        if (e.hp < 0.5) plume(time + i * 0.3, ex + 20, ey - 20, 4, 90, 40, 6, 22, '30,30,30', 0.55);
        if (e.hp < 0.25 || sputter) {
          ctx.fillStyle = `rgba(255,${110 + Math.sin(time * 25) * 50},40,.85)`;
          ctx.beginPath();
          ctx.ellipse(ex + 30, ey - 2, 12 + Math.sin(time * 22) * 4, 8, 0, 0, 7);
          ctx.fill();
        }
      }
      // Mast on top of the bag at the nose side, with the intent pennant.
      if (g.phase !== 'sinking') drawPennant(g, time, cx + 330, 250);
    };

    // ---- Her crew, in their real (already mirrored) places on the deck ----
    const drawCrew = () => {
      for (const c of g.crew) {
        const px = num(c.x);
        const face = c.face < 0 ? -1 : 1;
        ctx.fillStyle = c.wind > 0 ? '#ffffff' : '#a8443f';
        ink();
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.roundRect(px - 18, y - 70, 36, 64, 12);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px, y - 88, 20, 0, 7);
        ctx.fill();
        ctx.stroke();
        // What they do, at a glance: gunners carry a rammer, the stoker a shovel, the helmsman a cap.
        if (c.role === 'helm') {
          ctx.fillStyle = '#2b2622';
          ctx.fillRect(px - 22, y - 112, 44, 10);
        } else if (c.role === 'gunner') {
          ctx.fillStyle = '#4a4346';
          ctx.fillRect(px - 16, y - 44, 32, 14);
        } else if (c.role === 'stoker') {
          ctx.fillStyle = '#e8884a';
          ctx.fillRect(px - 16, y - 44, 32, 14);
        }
        ctx.fillStyle = CREAM;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(px + s * 8, y - 102);
          ctx.lineTo(px + s * 16, y - 124);
          ctx.lineTo(px + s * 18, y - 98);
          ctx.fill();
        }
        ctx.strokeStyle = '#8a6444';
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(px + face * 18, y - 40);
        if (c.wind > 0) ctx.lineTo(px + face * 10, y - 120);
        else if (c.hammer) {
          // hammering the hull: the tool swings down and up
          const sw = Math.sin(time * 14 + px);
          ctx.lineTo(px + face * (30 + 20 * sw), y - 50 + 30 * sw);
          ctx.stroke();
          ctx.fillStyle = '#4a4346';
          ctx.fillRect(px + face * (30 + 20 * sw) - 9, y - 60 + 30 * sw, 18, 12);
          ctx.beginPath(); // (the common stroke below then draws nothing)
        } else if (c.role === 'stoker' && Math.abs(num(c.x) - num(c.post)) < 25) {
          // shovelling coal into the boiler
          const sw = Math.sin(time * 6 + px);
          ctx.lineTo(px + face * (50 + 10 * sw), y - 30 - 20 * sw);
        } else ctx.lineTo(px + face * 60, y - 70);
        ctx.stroke();
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
      ctx.translate(cx, y - 120);
      ctx.scale(far, far);
      ctx.translate(-cx, -(y - 120));
    }
    ctx.save();
    ctx.translate(cx, y);
    if (sink) ctx.rotate(g.sink * 0.15);
    else ctx.rotate(-num(g.pitch) * sx); // nose up in a climb, nose down in a dive (flips with her facing)
    ctx.translate(-cx, -y);
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
    // Health bar over the gasbag, and her systems: lit while working, dark and crossed out when you've knocked them out.
    if (g.phase !== 'sinking' && far >= 0.99) {
      ink();
      ctx.lineWidth = 3;
      ctx.fillStyle = '#2b2622';
      ctx.fillRect(cx - 200, 190, 400, 22);
      ctx.fillStyle = '#a8443f';
      ctx.fillRect(cx - 196, 194, 392 * Math.max(0, g.hp / g.max), 14);
      if (g.posts) {
        const portsUp = g.ports ? g.ports.filter((q) => !q.dead).length : 3;
        const engOk = num(g.engF, 1) > 0.5;
        const items = [['GUNS ' + portsUp + '/3', g.posts.guns > 0 && portsUp > 0], ['STEAM', g.posts.steam], ['HELM', g.posts.helm], ['ENGINES', engOk]];
        ctx.font = '900 22px Georgia';
        ctx.textAlign = 'center';
        items.forEach(([name, on], i) => {
          const tx = cx - 225 + i * 150;
          ctx.fillStyle = on ? '#f2d36b' : 'rgba(255,255,255,.35)';
          ctx.fillText(name, tx, 244);
          if (!on) {
            ctx.strokeStyle = '#a8443f';
            ctx.lineWidth = 2.8;
            ctx.beginPath();
            ctx.moveTo(tx - 44, 236);
            ctx.lineTo(tx + 44, 228);
            ctx.stroke();
          }
        });
        ink();
      }
      if (g.charge) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 34px Georgia';
        ctx.textAlign = 'center';
        ctx.fillText(Math.ceil(g.charge.t), mx(g, GS.boilerX + 40), y - 150);
      }
    }
    ctx.restore();
    drawRope();
  }
}
