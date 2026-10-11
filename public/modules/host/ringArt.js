// THE RING, drawn flat (package R0; the 3D view bends it in R1 and dresses the castle in R2). The 2D fallback draws the castle's faces as outposts of stone with a SHUTTER over the core, the specials, the gallery's ledge,
// the Flagship's moorings, the raiders' zip-lines and the revolving guns' rail; and the RING DIAL on the HUD: the ship's angle round the ring, the faces, and which gate is open.
//   draw(time)                   in the world layer (after the terrain and the turrets)
//   drawDial(cx, cy, r, time)    in screen coordinates (render.js drawMinimap, under the goal text)
import { config } from '../../config.js';
import { toWorldX, toWorldY } from './pose.js';
import { mainShip } from './ships.js';
import { ringAngle } from './ring.js';

const STONE = '#9a958b', STONE_DARK = '#6f6a62', IRON = '#4a4f55', IRON_LIGHT = '#6a7078', WOOD = '#8a6444', WOOD_DARK = '#5e4129';

export function createRingArt({ ctx, state, ink }) {
  const eased = new WeakMap(); // face -> how far its shutter is drawn open (0..1), so it slides rather than jumps
  const easeOf = (f, dt) => {
    let v = eased.get(f) || 0;
    v += ((f.open > 0 ? 1 : 0) - v) * Math.min(1, dt * 9);
    eased.set(f, v);
    return v;
  };
  let lastT = 0;

  const rect = (x, y, w, h, fill) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  };

  // One castle face: the keep wall with crenellations, the core behind its shutter, and the ruin once it is breached.
  const drawFace = (f, time, dt) => {
    const c = f.core, wallW = 880, wallH = 760;
    ctx.save();
    ink();
    ctx.lineWidth = 4;
    if (f.down) { // rubble and smoke
      ctx.fillStyle = STONE_DARK;
      ctx.beginPath();
      ctx.moveTo(f.x - 420, f.y);
      ctx.lineTo(f.x - 300, f.y - 120);
      ctx.lineTo(f.x - 140, f.y - 60);
      ctx.lineTo(f.x + 40, f.y - 190);
      ctx.lineTo(f.x + 260, f.y - 80);
      ctx.lineTo(f.x + 420, f.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = `rgba(70,70,70,${0.45 + 0.2 * Math.sin(time * 3 + f.i)})`;
      ctx.beginPath();
      ctx.arc(f.x - 60, f.y - 260 - ((time * 40) % 90), 38, 0, 7);
      ctx.fill();
      ctx.restore();
      return;
    }
    // The wall and its battlements.
    rect(f.x - wallW / 2, f.y - wallH, wallW, wallH, STONE);
    ctx.fillStyle = STONE_DARK;
    for (let k = 0; k < 6; k++) {
      const bx = f.x - wallW / 2 + 10 + k * (wallW / 6);
      rect(bx, f.y - wallH - 60, wallW / 6 - 30, 60, STONE);
    }
    ctx.lineWidth = 2.4;
    ctx.globalAlpha = 0.35;
    for (let row = 1; row < 6; row++) { ctx.beginPath(); ctx.moveTo(f.x - wallW / 2, f.y - row * 125); ctx.lineTo(f.x + wallW / 2, f.y - row * 125); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 4;
    // The core: a dark alcove with the core glowing in it...
    const open = easeOf(f, dt);
    rect(c.x - c.w / 2 - 14, c.y - c.h / 2 - 14, c.w + 28, c.h + 28, STONE_DARK);
    rect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h, '#2a1810');
    const pulse = 0.65 + 0.35 * Math.sin(time * 6);
    const k = Math.max(0, f.hp / f.max);
    const glow = ctx.createRadialGradient(c.x, c.y, 10, c.x, c.y, c.w * 0.62);
    glow.addColorStop(0, `rgba(255,${Math.round(120 + 100 * k)},60,${(0.5 + 0.5 * pulse) * (0.35 + 0.65 * open)})`);
    glow.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h);
    ctx.fillStyle = k > 0.5 ? '#ffb347' : '#ff5a3c';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 62 * (0.8 + 0.2 * pulse), 0, 7);
    ctx.fill();
    ctx.stroke();
    // ...and the SHUTTER over it: an iron plate that slides up out of the way when the window is open.
    ctx.save();
    ctx.beginPath();
    ctx.rect(c.x - c.w / 2 - 2, c.y - c.h / 2 - 2 - c.h, c.w + 4, c.h * 2 + 4);
    ctx.clip();
    const lift = open * (c.h - 36);
    rect(c.x - c.w / 2, c.y - c.h / 2 - lift, c.w, c.h, IRON);
    ctx.fillStyle = IRON_LIGHT;
    ctx.lineWidth = 2.4;
    for (let r = 0; r < 4; r++) { ctx.beginPath(); ctx.moveTo(c.x - c.w / 2, c.y - c.h / 2 - lift + 18 + r * 78); ctx.lineTo(c.x + c.w / 2, c.y - c.h / 2 - lift + 18 + r * 78); ctx.stroke(); }
    for (let r = 0; r < 5; r++) for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(c.x + sx * (c.w / 2 - 14), c.y - c.h / 2 - lift + 22 + r * 70, 5, 0, 7); ctx.fill(); }
    ctx.restore();
    ctx.lineWidth = 4;
    // A warning lamp: red while shut, green flashing when open. The core's hit points over it while it is open.
    ctx.fillStyle = f.open > 0 ? (Math.sin(time * 14) > 0 ? '#7CFC00' : '#2e6b00') : '#c0392b';
    ctx.beginPath();
    ctx.arc(c.x, c.y - c.h / 2 - 44, 14, 0, 7);
    ctx.fill();
    ctx.stroke();
    if (f.open > 0) {
      const w = c.w + 40, y = c.y - c.h / 2 - 84;
      rect(c.x - w / 2, y, w, 18, '#222');
      ctx.fillStyle = '#ff5a3c';
      ctx.fillRect(c.x - w / 2 + 2, y + 2, (w - 4) * k, 14);
      ctx.fillStyle = '#fff';
      ctx.font = '700 30px ' + config.FONTS.TEXT;
      ctx.textAlign = 'center';
      ctx.fillText('SHUTTER OPEN ' + f.open.toFixed(0) + 's', c.x, y - 12);
    }
    if (f.charge) { // the charge at the keep door: its fuse
      ctx.fillStyle = '#ff5a1f';
      ctx.font = '700 34px ' + config.FONTS.TEXT;
      ctx.textAlign = 'center';
      ctx.fillText('CHARGE ' + Math.max(0, f.charge.t).toFixed(0), f.gal ? f.gal.door : f.x, (f.gal ? f.gal.y : f.y) - 110);
    }
    ctx.textAlign = 'left';
    ctx.restore();
  };

  // A special: the bat hangar (a shed with big doors), the flak battery, the mortar; the gallery is a wooden ledge with a door.
  const drawSpecial = (f, time) => {
    const sp = f.special;
    ctx.save();
    ink();
    ctx.lineWidth = 4;
    if (sp.kind === 'gallery') {
      const g = f.gal;
      if (f.down) { ctx.restore(); return; }
      // The ledge and its posts, the rail, the door at its inner end.
      rect(g.x0, g.y, g.x1 - g.x0, 22, WOOD);
      ctx.fillStyle = WOOD_DARK;
      for (let x = g.x0 + 40; x < g.x1; x += 120) { ctx.beginPath(); ctx.moveTo(x, g.y + 22); ctx.lineTo(x + 70, g.y + 150); ctx.lineTo(x + 90, g.y + 150); ctx.lineTo(x + 30, g.y + 22); ctx.closePath(); ctx.fill(); }
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(g.x0, g.y - 70);
      ctx.lineTo(g.x1 - 100, g.y - 70);
      for (let x = g.x0; x < g.x1 - 100; x += 100) { ctx.moveTo(x, g.y); ctx.lineTo(x, g.y - 70); }
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.fillStyle = '#2a1810';
      ctx.beginPath();
      ctx.rect(g.door - 50, g.y - 190, 100, 190);
      ctx.moveTo(g.door - 50, g.y - 190);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = f.charge ? '#ff5a1f' : '#d9a441';
      ctx.beginPath();
      ctx.arc(g.door, g.y - 100, 12 + (f.charge ? 4 * Math.sin(time * 18) : 0), 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,230,120,' + (0.45 + 0.3 * Math.sin(time * 4)) + ')'; // a hook-here beacon
      ctx.font = '700 28px ' + config.FONTS.TEXT;
      ctx.textAlign = 'center';
      ctx.fillText('GALLERY - HOOK ON!', (g.x0 + g.x1) / 2, g.y - 100);
      ctx.textAlign = 'left';
      if (g.job.prog > 0.02) { // the charge being planted
        rect(g.door - 70, g.y - 230, 140, 16, '#222');
        ctx.fillStyle = '#ff5a1f';
        ctx.fillRect(g.door - 68, g.y - 228, 136 * g.job.prog, 12);
      }
      ctx.restore();
      return;
    }
    const x = sp.x, y = sp.y;
    if (sp.dead) {
      ctx.fillStyle = STONE_DARK;
      ctx.beginPath();
      ctx.moveTo(x - 90, y);
      ctx.lineTo(x - 50, y - 40);
      ctx.lineTo(x + 10, y - 20);
      ctx.lineTo(x + 90, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (sp.kind === 'hangar') {
      rect(x - 130, y - 190, 260, 190, STONE);
      ctx.fillStyle = '#1c1520';
      ctx.beginPath();
      ctx.rect(x - 90, y - 140, 180, 140);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#c9a0ff';
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x - 50 + k * 50, y - 60 - (k % 2) * 24, 9, 0, 7); ctx.fill(); }
      ctx.beginPath();
      ctx.moveTo(x - 150, y - 190);
      ctx.lineTo(x, y - 260);
      ctx.lineTo(x + 150, y - 190);
      ctx.closePath();
      ctx.fillStyle = '#3b2c4c';
      ctx.fill();
      ctx.stroke();
    } else if (sp.kind === 'flak') {
      rect(x - 80, y - 70, 160, 70, STONE);
      ctx.save();
      ctx.translate(x, y - 80);
      ctx.rotate(-0.9);
      rect(0, -14, 120, 28, IRON);
      ctx.restore();
      ctx.fillStyle = IRON_LIGHT;
      ctx.beginPath();
      ctx.arc(x, y - 80, 30, 0, 7);
      ctx.fill();
      ctx.stroke();
    } else {
      rect(x - 90, y - 60, 180, 60, STONE);
      ctx.save();
      ctx.translate(x, y - 70);
      ctx.rotate(-1.25);
      rect(0, -26, 110, 52, IRON);
      ctx.restore();
    }
    if (sp.hp < sp.max) { // wrecked a bit
      rect(x - 50, y - 300, 100, 12, '#222');
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(x - 48, y - 298, 96 * Math.max(0, sp.hp / sp.max), 8);
    }
    ctx.restore();
  };

  // The rail of the revolving guns, the zip-lines, the start of the ring, the Flagship's moorings.
  const drawExtras = (r, time) => {
    const course = state.course;
    ctx.save();
    ink();
    // The start of the ring: a pair of banner posts.
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(r.xRing, r.axisY + 1400);
    ctx.lineTo(r.xRing, r.axisY - 900);
    ctx.stroke();
    ctx.fillStyle = '#a8443f';
    ctx.beginPath();
    ctx.moveTo(r.xRing, r.axisY - 900);
    ctx.lineTo(r.xRing + 260, r.axisY - 820 + Math.sin(time * 3) * 14);
    ctx.lineTo(r.xRing, r.axisY - 740);
    ctx.fill();
    ctx.stroke();
    // The rail: a thin dashed line at the revolving guns' height, with a bracket under each gun.
    const rails = course.turrets.filter((t) => t.rev);
    if (rails.length) {
      ctx.setLineDash([60, 40]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(r.xRing, rails[0].my);
      ctx.lineTo(r.xRing + r.C, rails[0].my);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const t of rails) if (!t.dead) { ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(t.mx - 36, t.my + 4); ctx.lineTo(t.mx + 36, t.my + 4); ctx.stroke(); }
    }
    // Zip-lines from the gallery to the ship.
    for (const z of r.zips) {
      if (z.x1 == null) continue;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(z.x0, z.y0);
      ctx.lineTo(z.x1, z.y1);
      ctx.stroke();
      ctx.fillStyle = '#a8443f';
      ctx.beginPath();
      ctx.arc(z.x, z.y + 18, 14, 0, 7);
      ctx.fill();
      ctx.stroke();
    }
    // The Flagship's moorings: a rope from her to the top of each face; a cut one hangs slack.
    const z = state.boss;
    if (r.moor && z && z.moor) {
      r.moor.faces.forEach((fi, k) => {
        const f = r.faces[fi];
        ctx.lineWidth = r.moor.cut[k] ? 3 : 7;
        ctx.beginPath();
        if (r.moor.cut[k]) { ctx.moveTo(f.x, f.y - 820); ctx.quadraticCurveTo(f.x + 60, f.y - 700, f.x + 20, f.y - 640); } else { ctx.moveTo(z.x + (k ? 160 : -160), z.y + 150); ctx.lineTo(f.x, f.y - 820); }
        ctx.stroke();
        if (!r.moor.cut[k]) { ctx.fillStyle = '#d9a441'; ctx.beginPath(); ctx.arc(f.x, f.y - 820, 20, 0, 7); ctx.fill(); ctx.stroke(); }
      });
    }
    ctx.restore();
  };

  const draw = (time) => {
    const r = state.course && state.course.ring;
    if (!r) return;
    const dt = Math.min(0.1, Math.max(0, time - lastT));
    lastT = time;
    drawExtras(r, time);
    for (const f of r.faces) { drawFace(f, time, dt); drawSpecial(f, time); }
  };

  // The RING DIAL (screen coordinates): the ship's angle round the ring (a dashed tail for the approach), each face as a tick (red standing, grey breached, gold with its shutter open), and the keep's pool.
  const drawDial = (cx, cy, rad, time) => {
    const r = state.course && state.course.ring;
    if (!r) return;
    const ship = mainShip(state), x = toWorldX(ship, ship.layout.refPoint.x);
    const th = ringAngle(r, x); // radians round the ring; < 0 on the approach, > 2 pi past its end
    const at = (a, rr) => [cx + Math.sin(a) * rr, cy - Math.cos(a) * rr];
    ctx.save();
    ink();
    ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(243,234,214,0.92)';
    ctx.beginPath();
    ctx.arc(cx, cy, rad + 14, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#7a7266';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, 7);
    ctx.stroke();
    ink();
    // The faces.
    for (const f of r.faces) {
      const a = f.angle, open = !f.down && f.open > 0;
      const [x0, y0] = at(a, rad - 9), [x1, y1] = at(a, rad + 11);
      ctx.strokeStyle = f.down ? '#9a948a' : open ? '#e0a800' : '#c0392b';
      ctx.lineWidth = open ? 9 : 6;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      if (open) { // the open gate pulses
        ctx.strokeStyle = `rgba(255,210,63,${0.35 + 0.35 * Math.sin(time * 9)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(...at(a, rad), 16 + 3 * Math.sin(time * 9), 0, 7);
        ctx.stroke();
      }
    }
    // The citadel's moorings, as two dots joined to the Flagship in the middle.
    if (r.moor) {
      ctx.fillStyle = state.boss ? '#3a3a3a' : '#bbb';
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, 7);
      ctx.fill();
      r.moor.faces.forEach((fi, k) => {
        if (r.moor.cut[k]) return;
        ctx.strokeStyle = '#d9a441';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(...at(r.faces[fi].angle, rad - 9));
        ctx.stroke();
      });
    }
    // The ship: where she is round the ring (the approach is drawn as a short dashed tail below the start).
    const clamped = Math.max(0, Math.min(Math.PI * 2, th));
    ctx.fillStyle = th < 0 ? '#3a86ff' : '#e63946';
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(...at(clamped, rad), 8, 0, 7);
    ctx.fill();
    ctx.stroke();
    // The keep's pool and the words.
    ctx.fillStyle = '#3a2c20';
    ctx.font = '700 12px ' + config.FONTS.TEXT;
    ctx.textAlign = 'center';
    const open = r.faces.find((f) => !f.down && f.open > 0);
    const left = r.faces.filter((f) => !f.down).length;
    ctx.fillText(r.crown ? 'THE CROWN FALLS!' : open ? 'GATE ' + (open.i + 1) + ' OPEN ' + open.open.toFixed(0) + 's' : th < 0 ? 'APPROACH' : 'GATES ' + (r.faces.length - left) + '/' + r.faces.length, cx, cy - 2);
    const w = rad * 1.5;
    ctx.fillStyle = '#222';
    ctx.fillRect(cx - w / 2, cy + 8, w, 8);
    ctx.fillStyle = '#c9a85a';
    ctx.fillRect(cx - w / 2 + 1, cy + 9, (w - 2) * (r.keep.hp / r.keep.max), 6);
    ctx.font = '600 11px ' + config.FONTS.TEXT;
    ctx.fillStyle = '#3a2c20';
    ctx.fillText('KEEP', cx, cy + 28);
    ctx.textAlign = 'left';
    ctx.restore();
  };

  return { draw, drawDial };
}
