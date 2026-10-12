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
    } else if (sp.kind === 'ballista') { // the ballista (CASTLE.md D1): a wooden frame with a great bow, a bolt laid in it; the bow draws back while it locks
      const lock = sp.lock, pull = lock ? 1 - Math.max(0, lock.t) / lock.max : 0;
      rect(x - 90, y - 50, 180, 50, STONE);
      const ang = lock ? Math.atan2(lock.y1 - lock.y0, lock.x1 - lock.x0) : -0.5;
      ctx.save();
      ctx.translate(x, y - 100);
      ctx.rotate(ang);
      ctx.fillStyle = WOOD;
      ctx.fillRect(-20, -9, 130, 18);
      ctx.strokeRect(-20, -9, 130, 18);
      ctx.lineWidth = 6;
      ctx.beginPath(); // the bow arms, bent back by the pull
      ctx.moveTo(95, -86); ctx.quadraticCurveTo(95 - 40 * pull, 0, 95, 86);
      ctx.stroke();
      ctx.lineWidth = 2.4;
      ctx.beginPath(); // the string, to the bolt's tail
      ctx.moveTo(95, -86); ctx.lineTo(95 - 70 * pull, 0); ctx.lineTo(95, 86);
      ctx.stroke();
      ctx.fillStyle = IRON_LIGHT; // the bolt
      ctx.fillRect(95 - 70 * pull - 4, -4, 150, 8);
      ctx.strokeRect(95 - 70 * pull - 4, -4, 150, 8);
      ctx.restore();
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
      if (z.grapple) { // a grapple: the hook on the keel, and a soldier climbing the rope
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(z.x1 - 22, z.y1 + 24);
        ctx.quadraticCurveTo(z.x1 + 4, z.y1 + 2, z.x1 + 22, z.y1 + 24);
        ctx.stroke();
        ctx.fillStyle = '#7a5a3a';
        ctx.beginPath();
        ctx.rect(z.x - 7, z.y - 10, 14, 30);
        ctx.fill();
        ctx.stroke();
        continue;
      }
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

  // ---------- the garrison (CASTLE.md D1, garrison.js; the 3D look is D2) ----------
  const BANNER = '#a8443f', BANNER_TRIM = '#e0b84a', BODY = '#6b5a4a', HELM = '#9aa0a8';

  // One soldier standing at (x, y) (his feet), pose: 'stand' | 'cheer' (arms up) | 'man' (hunched at a gun) | 'run' | 'give' (hands up, giving up).
  const MEN_SCALE = 1.7; // (the men are drawn this much larger than life so a squad reads as a block from the camera's distance)
  const soldier = (x0, y0, pose, time, i, dir = 1) => {
    ctx.save();
    ctx.translate(x0, y0);
    ctx.scale(MEN_SCALE, MEN_SCALE);
    ctx.lineWidth = 3;
    const x = 0, y = 0;
    const bob = pose === 'cheer' ? Math.abs(Math.sin(time * 9 + i)) * 14 : pose === 'run' ? Math.abs(Math.sin(time * 12 + i)) * 8 : 0;
    const top = y - bob - (pose === 'man' ? 46 : 58);
    ctx.fillStyle = BODY;
    ctx.fillRect(x - 7, top + 12, 14, 30 - (pose === 'man' ? 8 : 0));
    ctx.strokeRect(x - 7, top + 12, 14, 30 - (pose === 'man' ? 8 : 0));
    ctx.fillStyle = HELM;
    ctx.beginPath();
    ctx.arc(x, top + 8, 8, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (pose === 'cheer' || pose === 'give') { ctx.moveTo(x - 7, top + 16); ctx.lineTo(x - 15, top - 8); ctx.moveTo(x + 7, top + 16); ctx.lineTo(x + 15, top - 8); } else if (pose === 'run') { ctx.moveTo(x, top + 18); ctx.lineTo(x + dir * 16, top + 30); } else { ctx.moveTo(x - 7, top + 20); ctx.lineTo(x - 12, top + 34); ctx.moveTo(x + 7, top + 20); ctx.lineTo(x + 12, top + 34); }
    ctx.stroke();
    ctx.restore();
  };

  // A squad: a block of men on the ground, with a banner pole (plaza squads), a white flag when it gives up.
  const drawSquad = (q, time) => {
    if (q.state === 'dead') return;
    const surrender = q.state === 'surrender';
    const pose = surrender ? 'give' : q.state === 'cheer' ? 'cheer' : q.state === 'flee' ? 'run' : q.kind === 'gun' ? 'man' : 'stand';
    const dir = q.fleeTo > q.x ? 1 : -1;
    for (let i = 0; i < q.n; i++) soldier(q.x + (i - (q.n - 1) / 2) * 30, q.y, pose, time, i + q.id, dir);
    if (q.kind !== 'plaza' || q.state === 'flee') return;
    // the banner pole (a white flag once they have given up)
    const px = q.x, top = q.y - 300;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(px, q.y - 50);
    ctx.lineTo(px, top);
    ctx.stroke();
    const w = Math.sin(time * 4 + q.id) * 8;
    ctx.fillStyle = surrender ? '#ffffff' : BANNER;
    ctx.beginPath();
    ctx.moveTo(px, top);
    ctx.quadraticCurveTo(px + 45, top - 12 + w, px + 94, top + 8 + w);
    ctx.lineTo(px + 78, top + 36 + w);
    ctx.lineTo(px + 94, top + 60 + w);
    ctx.quadraticCurveTo(px + 45, top + 46 + w, px, top + 58);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (!surrender) { ctx.fillStyle = BANNER_TRIM; ctx.fillRect(px + 9, top + 21 + w / 2, 60, 12); }
    if (q.swing) { // the grapple being swung
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(q.x + 60, q.y - 200, 50, time * 9, time * 9 + 4.4);
      ctx.stroke();
      ctx.lineWidth = 4;
    }
  };

  // An archer post on the wall walk: a little tower with an archer; while it tells, the bow is drawn, a "!" shows and an amber arc runs to where the volley will fall.
  const drawPost = (f, p, time) => {
    ctx.save();
    ink();
    ctx.lineWidth = 4;
    if (p.dead) { // a stump
      ctx.fillStyle = STONE_DARK;
      ctx.fillRect(p.x - 40, p.y + 20, 80, 24);
      ctx.strokeRect(p.x - 40, p.y + 20, 80, 24);
      ctx.restore();
      return;
    }
    rect(p.x - 34, p.y + 36, 68, f.y - p.y - 36, STONE); // the column
    rect(p.x - 52, p.y, 104, 36, STONE_DARK); // the platform
    ctx.fillStyle = STONE;
    for (let k = -1; k <= 1; k++) ctx.fillRect(p.x + k * 36 - 10, p.y - 22, 20, 22);
    const tell = p.mode === 'tell', dazzled = p.lit > 0;
    const dir = p.aim ? Math.sign(p.aim.x - p.x) || 1 : (p.k ? 1 : -1);
    soldier(p.x, p.y, tell ? 'cheer' : 'stand', time, p.k, dir);
    ctx.lineWidth = 4;
    ctx.beginPath(); // the bow
    ctx.arc(p.x + dir * 22, p.y - 44, 24, dir > 0 ? -1.3 : Math.PI - 1.3 + 0.0, dir > 0 ? 1.3 : Math.PI + 1.3);
    ctx.stroke();
    if (dazzled) { // dazzled by a searchlight: stars
      ctx.fillStyle = '#fff2b0';
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(p.x - 24 + k * 24, p.y - 86 - Math.sin(time * 8 + k) * 6, 6, 0, 7); ctx.fill(); }
    }
    if (p.hp < p.max) { // wrecked a bit
      rect(p.x - 40, p.y - 118, 80, 10, '#222');
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(p.x - 38, p.y - 116, 76 * Math.max(0, p.hp / p.max), 6);
    }
    if (tell && p.aim) { // the telegraph: an amber lob to the aim point, brighter as the volley nears
      const k = 1 - p.telegraph / GG_TELL();
      ctx.strokeStyle = `rgba(255,170,40,${0.35 + 0.55 * k})`;
      ctx.lineWidth = 5 + 3 * k;
      ctx.setLineDash([26, 16]);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 40);
      ctx.quadraticCurveTo((p.x + p.aim.x) / 2, Math.min(p.y, p.aim.y) - 380, p.aim.x, p.aim.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff8c1a';
      ctx.font = '700 46px ' + config.FONTS.TEXT;
      ctx.textAlign = 'center';
      ctx.fillText('!', p.x, p.y - 130 - 6 * Math.sin(time * 14));
      ctx.textAlign = 'left';
    }
    ctx.restore();
  };
  const GG_TELL = () => config.GARRISON.ARCHER.TELL;

  // The boom chain: a glowing span from the anchor high up to its low end, with a weight there; broken, its two halves hang loose.
  const drawChain = (c, time, called) => {
    ctx.save();
    ink();
    const live = !c.broken, glow = live ? 0.45 + 0.35 * Math.sin(time * 5) + (c.snagging ? 0.4 : 0) : 0;
    if (live) {
      ctx.strokeStyle = `rgba(255,200,70,${Math.min(1, glow)})`;
      ctx.lineWidth = 26;
      ctx.beginPath();
      ctx.moveTo(c.x, c.yTop);
      ctx.lineTo(c.x, c.yLow);
      ctx.stroke();
      ink();
      ctx.lineWidth = 9;
      ctx.setLineDash([22, 12]); // the links
      ctx.beginPath();
      ctx.moveTo(c.x, c.yTop);
      ctx.lineTo(c.x, c.yLow);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = IRON;
      ctx.beginPath();
      ctx.arc(c.x, c.yLow + 20, 34, 0, 7); // the weight
      ctx.fill();
      ctx.stroke();
      const k = Math.max(0, c.hp / c.max);
      rect(c.x - 40, c.yLow + 70, 80, 12, '#222'); // its strength
      ctx.fillStyle = k > 0.4 ? '#ffd23f' : '#ff5a3c';
      ctx.fillRect(c.x - 38, c.yLow + 72, 76 * k, 8);
      if (called || c.snagging) { // the lookout's call
        ctx.fillStyle = '#ffe9b0';
        ctx.font = '700 44px ' + config.FONTS.TEXT;
        ctx.textAlign = 'center';
        ctx.fillText(c.snagging ? 'SNAGGED!' : 'BOOM CHAIN - DIVE UNDER!', c.x, c.yLow + 130);
        ctx.textAlign = 'left';
      }
    } else { // the two loose halves, swaying
      ctx.lineWidth = 8;
      ctx.setLineDash([22, 12]);
      const sw = Math.sin(time * 2) * 30;
      ctx.beginPath();
      ctx.moveTo(c.x, c.yTop);
      ctx.quadraticCurveTo(c.x + sw, c.yTop + 300, c.x + sw * 1.4, c.yTop + 640);
      ctx.moveTo(c.x, c.yLow);
      ctx.quadraticCurveTo(c.x - sw, c.yLow - 140, c.x - sw * 1.4, c.yLow - 320);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  };

  // The ballista's aim-line (sp.lock): pale and thin while it tracks, solid and hot when it has frozen for the shot.
  const drawLock = (sp) => {
    const L = sp.lock;
    if (!L || sp.dead) return;
    const frozen = L.t <= config.GARRISON.BALLISTA.FREEZE, k = 1 - Math.max(0, L.t) / L.max;
    ctx.save();
    ctx.strokeStyle = frozen ? 'rgba(255,90,60,0.9)' : `rgba(255,240,200,${0.25 + 0.5 * k})`;
    ctx.lineWidth = frozen ? 7 : 4;
    if (!frozen) ctx.setLineDash([40, 24]);
    ctx.beginPath();
    ctx.moveTo(L.x0, L.y0);
    ctx.lineTo(L.x0 + (L.x1 - L.x0) * 1.6, L.y0 + (L.y1 - L.y0) * 1.6); // (the line runs on past her)
    ctx.stroke();
    ctx.restore();
  };

  // The castle's men and their works, in the world layer: posts, squads, the chain, the ballista's line, the flag and the horn on a wall.
  const drawGarrison = (r, time) => {
    if (!r.gar) return;
    for (const f of r.faces) {
      ctx.save();
      ink();
      ctx.lineWidth = 4;
      if (!f.down) {
        if (f.flag > 0) { // the flag on the wall top and, with the horn, rings of sound
          const fx = f.x + 410, top = f.y - 1010;
          ctx.beginPath();
          ctx.moveTo(fx, f.y - 760);
          ctx.lineTo(fx, top);
          ctx.stroke();
          ctx.fillStyle = '#d63a2a';
          const w = Math.sin(time * 9) * 10;
          ctx.beginPath();
          ctx.moveTo(fx, top);
          ctx.lineTo(fx + 120, top + 18 + w);
          ctx.lineTo(fx + 96, top + 44 + w);
          ctx.lineTo(fx + 120, top + 70 + w);
          ctx.lineTo(fx, top + 76);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          if (f.horn > 0) {
            ctx.strokeStyle = `rgba(255,200,90,${f.horn / 1.5})`;
            ctx.lineWidth = 6;
            for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(fx, top + 30, 90 + (1.5 - f.horn) * 260 + k * 60, -0.9, 0.9); ctx.stroke(); }
          }
        }
        for (const p of f.posts || []) drawPost(f, p, time);
      }
      ctx.restore();
      for (const q of f.squads || []) { ctx.save(); ink(); ctx.lineWidth = 4; drawSquad(q, time); ctx.restore(); }
      drawLock(f.special);
    }
    for (const c of r.gar.chains) drawChain(c, time, c.called);
  };

  // An arrow or a ballista bolt in the air (render.js, where the other enemy shots are drawn).
  const drawShot = (b) => {
    const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp, len = b.bolt ? 120 : 34;
    ctx.save();
    ctx.strokeStyle = b.bolt ? '#3a2c20' : b.burn ? '#ff7b1a' : '#4a3b2c';
    ctx.lineWidth = b.bolt ? 9 : 4;
    ctx.beginPath();
    ctx.moveTo(b.x - ux * len, b.y - uy * len);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.fillStyle = b.bolt ? '#8c9096' : '#cfd3d8';
    ctx.beginPath();
    ctx.moveTo(b.x + ux * 14, b.y + uy * 14);
    ctx.lineTo(b.x - uy * 7, b.y + ux * 7);
    ctx.lineTo(b.x + uy * 7, b.y - ux * 7);
    ctx.closePath();
    ctx.fill();
    if (b.burn) { ctx.fillStyle = 'rgba(255,140,30,0.55)'; ctx.beginPath(); ctx.arc(b.x - ux * 10, b.y - uy * 10, 11, 0, 7); ctx.fill(); }
    ctx.restore();
  };

  const draw = (time) => {
    const r = state.course && state.course.ring;
    if (!r) return;
    const dt = Math.min(0.1, Math.max(0, time - lastT));
    lastT = time;
    drawExtras(r, time);
    for (const f of r.faces) { drawFace(f, time, dt); drawSpecial(f, time); }
    drawGarrison(r, time);
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
    // The garrison (D1): amber chevrons beside a gate whose archers or ballista are about to loose; the boom chains as short gold bars across the ring (grey once broken).
    for (const f of r.faces) {
      if (f.down || !(f.flag > 0)) continue;
      const a = f.angle, s = 5 + 1.5 * Math.sin(time * 14), ox = Math.sin(a), oy = -Math.cos(a); // (ox, oy: the way out from the dial's middle; the chevron points outward)
      ctx.strokeStyle = '#ff8c1a';
      ctx.lineWidth = 3;
      for (let k = 0; k < 2; k++) {
        const [px, py] = at(a, rad + 22 + k * 8);
        ctx.beginPath();
        ctx.moveTo(px - ox * s - oy * s, py - oy * s + ox * s);
        ctx.lineTo(px + ox * s, py + oy * s);
        ctx.lineTo(px - ox * s + oy * s, py - oy * s - ox * s);
        ctx.stroke();
      }
    }
    for (const c of (r.gar && r.gar.chains) || []) {
      const a = ringAngle(r, c.x), [x0, y0] = at(a, rad - 6), [x1, y1] = at(a, rad + 8);
      ctx.strokeStyle = c.broken ? '#9a948a' : c.snagging ? '#ff5a3c' : '#d9a441';
      ctx.lineWidth = 3;
      ctx.setLineDash(c.broken ? [3, 4] : []);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.setLineDash([]);
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

  return { draw, drawDial, drawShot };
}
