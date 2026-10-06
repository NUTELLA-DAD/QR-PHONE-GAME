// Drawing for an enemy gunship (ship coordinates - drawn inside the ship's transform). She is drawn
// in her own home frame, shifted to wherever she is now (g.dx, g.dy) with a slight tilt from her
// climb/dive. Also: her crew, the grapple rope to our bow (sagging when slack, straight when taut),
// the swing line, and the charge ticking on her boiler.
import { GS, POSTS, ANCHOR, BOW } from './gunship.js';
import { config } from '../../config.js';

export function createGunshipArt({ ctx, state, ink }) {
  return (time) => {
    const g = state.gunship;
    if (!g) return;
    const o = 0; // (everything below is in her home frame; the translate puts her where she is)
    const dx = g.dx || 0;
    const dy = g.dy || 0;
    const sink = g.phase === 'sinking' ? g.sink * g.sink * 120 : 0;
    const x0 = GS.x0 + o;
    const x1 = GS.x1 + o;
    const y = GS.deckY + sink;
    const cx = (x0 + x1) / 2;
    // The rope and swing line are drawn in ship coordinates, after her own transform is undone.
    const drawRope = () => {
      if (!g.rope) return;
      const ax = ANCHOR.x + dx;
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
    // Tilt: a slight nose-up when she climbs, nose-down when she dives (her bow points at us, to the left).
    const tilt = Math.max(-0.04, Math.min(0.04, (g.wvy || 0) * config.GUNSHIP.TILT_PER_SPEED));
    ctx.save();
    ctx.translate(dx, dy);
    if (sink) {
      ctx.translate(cx, y);
      ctx.rotate(g.sink * 0.15);
      ctx.translate(-cx, -y);
    } else if (tilt) {
      ctx.translate(cx, y);
      ctx.rotate(tilt);
      ctx.translate(-cx, -y);
    }
    // Gasbag.
    ink();
    ctx.lineWidth = 3.2;
    ctx.fillStyle = g.hit > 0 ? '#ffffff' : '#3d2b4f';
    ctx.beginPath();
    ctx.ellipse(cx, 380, 660, 160, 0, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 3;
    for (let k = -4; k <= 4; k++) {
      ctx.beginPath();
      ctx.ellipse(cx, 380, Math.abs(k) * 150 + 10, 160, 0, k < 0 ? Math.PI / 2 : -Math.PI / 2, k < 0 ? Math.PI * 1.5 : Math.PI / 2);
      ctx.stroke();
    }
    // Horns emblem.
    ctx.fillStyle = '#a8443f';
    ctx.beginPath();
    ctx.arc(cx, 380, 60, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#2b2622';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * 22, 410);
      ctx.quadraticCurveTo(cx + s * 40, 350, cx + s * 10, 340);
      ctx.quadraticCurveTo(cx + s * 18, 375, cx + s * 6, 405);
      ctx.fill();
    }
    // Rigging.
    ink();
    ctx.lineWidth = 3;
    for (let k = 0; k < 5; k++) {
      const rx = x0 + 100 + k * ((x1 - x0 - 200) / 4);
      ctx.beginPath();
      ctx.moveTo(rx, 520);
      ctx.lineTo(rx + 20, y - 80);
      ctx.stroke();
    }
    // Yardarm sticking out toward us (the hookshot catches it).
    const ax = ANCHOR.x + o;
    const ay = ANCHOR.y + sink;
    ink();
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
    // Hull.
    ctx.lineWidth = 3.2;
    ctx.fillStyle = g.hit > 0 ? '#ffffff' : '#4a2626';
    ctx.beginPath();
    ctx.moveTo(x0 - 60, y - 80);
    ctx.lineTo(x1 + 90, y - 80);
    ctx.lineTo(x1 + 40, y + 110);
    ctx.lineTo(x0, y + 120);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2a1616';
    ctx.fillRect(x0 - 20, y - 6, x1 - x0 + 70, 16); // deck
    ctx.strokeRect(x0 - 20, y - 6, x1 - x0 + 70, 16);
    // Gun ports facing us, glowing before a broadside.
    for (let k = 0; k < 3; k++) {
      const py = y - 80 + 40 + k * 70 - 0;
      const glow = g.warnFire ? 0.5 + 0.5 * Math.sin(time * 30) : 0;
      ctx.fillStyle = glow ? `rgba(255,${80 + 100 * (1 - glow)},60,1)` : '#2b2622';
      ctx.beginPath();
      ctx.arc(x0 - 30, py, 16, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#4a4346';
      ctx.fillRect(x0 - 90, py - 8, 60, 16);
      ctx.strokeRect(x0 - 90, py - 8, 60, 16);
    }
    // Boiler (the target) with the charge.
    const bx = GS.boilerX + o;
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(bx - 50, y - 110, 100, 104);
    ctx.strokeRect(bx - 50, y - 110, 100, 104);
    ctx.fillStyle = `rgba(255,120,40,${0.6 + 0.3 * Math.sin(time * 6)})`;
    ctx.beginPath();
    ctx.arc(bx, y - 50, 22, 0, 7);
    ctx.fill();
    ctx.stroke();
    if (g.charge) {
      const blink = Math.sin(time * (8 + (10 - g.charge.t) * 3)) > 0;
      ctx.fillStyle = blink ? '#ff2e55' : '#f2d36b';
      ctx.beginPath();
      ctx.arc(bx + 40, y - 120, 22, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 34px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText(Math.ceil(g.charge.t), bx + 40, y - 150);
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
    // Her helm wheel.
    const hx = POSTS.helm[0] + 40 + o;
    ink();
    ctx.lineWidth = 3;
    ctx.fillStyle = '#8a6a44';
    ctx.fillRect(hx - 6, y - 60, 12, 54);
    ctx.strokeRect(hx - 6, y - 60, 12, 54);
    ctx.save();
    ctx.translate(hx, y - 78);
    ctx.rotate(g.posts && !g.posts.helm ? time * 4 : Math.sin(time) * 0.3); // spins free with nobody on it
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
    // Crew: red horned raiders; they flash white while winding up a swing.
    for (const c of g.crew) {
      const px = c.x + o;
      ctx.fillStyle = c.wind > 0 ? '#ffffff' : '#a8443f';
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
      ctx.fillStyle = '#ebdfc0';
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
      ctx.moveTo(px + c.face * 18, y - 40);
      ctx.lineTo(px + c.face * (c.wind > 0 ? 10 : 60), y - (c.wind > 0 ? 120 : 70));
      ctx.stroke();
      ink();
      ctx.lineWidth = 3.2;
      for (let k = 0; k < c.hp; k++) {
        ctx.fillStyle = '#a8443f';
        ctx.fillRect(px - 18 + k * 13, y - 140, 9, 9);
      }
    }
    // Health bar over the gasbag.
    if (g.phase !== 'sinking') {
      ctx.fillStyle = '#2b2622';
      ctx.fillRect(cx - 200, 190, 400, 22);
      ctx.fillStyle = '#a8443f';
      ctx.fillRect(cx - 196, 194, 392 * Math.max(0, g.hp / g.max), 14);
      // Her systems: lit while crewed, dark and crossed out when you've knocked them out.
      if (g.posts) {
        const items = [['GUNS', g.posts.guns > 0], ['STEAM', g.posts.steam], ['HELM', g.posts.helm]];
        ctx.font = '900 24px Georgia';
        ctx.textAlign = 'center';
        items.forEach(([name, on], i) => {
          const tx = cx - 150 + i * 150;
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
      }
    }
    ctx.restore();
    drawRope();
  };
}
