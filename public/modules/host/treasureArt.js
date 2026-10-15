// THE OUTPOSTS' TREASURE, drawn (CASTLE.md package A2; treasure.js keeps state.away.tre). The 2D fallback draws the open vaults, the chests and sacks of gold lying on the ground (a bar fills while a man holds the button),
// the chests in the arms of the men who carry them, a chest on the hookshot's line, and the vault guards with their warning "!" and the line they aim along. The 3D view draws the vault, the chests and the sacks of gold
// itself (view3d/treasure3d.js, 3D.md section 34), so render.js passes `live3d` and only their words, the grab bar, TWO CARRY and the guards are drawn here, through the 3D camera; with 3D off (or the model layer failed)
// the same shapes are drawn as before. Every shape draws at the CURRENT transform and takes the scale of the thing (w) and of the words (u). Nothing wobbles: pulses are held for 1/8 s.
import { config } from '../../config.js';

const WOOD = '#9a6a3a', WOOD_DARK = '#6b4526', GOLD = '#ffd23f', IRON = '#4a4036', COIN = '#ffe27a';

export function createTreasureArt({ ctx, world, ink }) {
  const text = (s, x, y, size, fill, tu) => {
    ctx.font = '700 ' + Math.round(size * tu) + 'px ' + config.FONTS.TEXT;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * tu * 0.22);
    ctx.strokeStyle = '#fff7e0';
    ctx.strokeText(s, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(s, x, y);
  };
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };

  // A treasure chest standing on (x, y) (its feet): a box with a round lid, an iron band and a gold clasp. s = the size (1 = 64 px wide).
  const chest = (x, y, s, kind = 'chest', glint = false) => {
    ctx.save();
    ink();
    ctx.lineWidth = 3.4 * s;
    ctx.lineJoin = 'round';
    if (kind === 'gold') { // a sack of gold: a tied sack with coins at its foot
      ctx.fillStyle = '#c9a66b';
      ctx.beginPath();
      ctx.moveTo(x - 22 * s, y);
      ctx.quadraticCurveTo(x - 34 * s, y - 34 * s, x - 8 * s, y - 52 * s);
      ctx.lineTo(x + 8 * s, y - 52 * s);
      ctx.quadraticCurveTo(x + 34 * s, y - 34 * s, x + 22 * s, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COIN;
      for (const [dx, dy] of [[-26, -4], [-14, -9], [20, -6], [8, -3]]) { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, 7 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      ctx.restore();
      return;
    }
    if (kind === 'part') { // (LOOP.md G5, derelicts.js: a part stripped off a wreck: a grey iron crate with a bolt plate and a gear)
      ctx.fillStyle = '#8f9aa3';
      rr(x - 32 * s, y - 40 * s, 64 * s, 40 * s, 3 * s);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = IRON;
      ctx.lineWidth = 5 * s;
      ctx.beginPath();
      ctx.moveTo(x - 18 * s, y - 40 * s);
      ctx.lineTo(x - 18 * s, y);
      ctx.moveTo(x + 18 * s, y - 40 * s);
      ctx.lineTo(x + 18 * s, y);
      ctx.stroke();
      ink();
      ctx.lineWidth = 3 * s;
      ctx.fillStyle = glint ? '#fff2b0' : '#c9d3da';
      ctx.beginPath();
      ctx.arc(x, y - 22 * s, 10 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.fillStyle = WOOD;
    rr(x - 32 * s, y - 38 * s, 64 * s, 38 * s, 4 * s);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = WOOD_DARK;
    ctx.beginPath();
    ctx.moveTo(x - 32 * s, y - 36 * s);
    ctx.quadraticCurveTo(x, y - 74 * s, x + 32 * s, y - 36 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = IRON;
    ctx.lineWidth = 5 * s;
    ctx.beginPath();
    ctx.moveTo(x - 16 * s, y - 38 * s);
    ctx.lineTo(x - 16 * s, y);
    ctx.moveTo(x + 16 * s, y - 38 * s);
    ctx.lineTo(x + 16 * s, y);
    ctx.stroke();
    ink();
    ctx.lineWidth = 3 * s;
    ctx.fillStyle = glint ? '#fff2b0' : GOLD;
    rr(x - 7 * s, y - 46 * s, 14 * s, 18 * s, 3 * s);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  // The vault: a stone slab let into the ground with a dark opening, the sign over it. n = chests left.
  const vault = (v, x, y, w, u, k8, n, live3d = false) => {
    if (!live3d) { // (the 3D view has a stone strongroom of its own: only the words are drawn there, over its roof)
      ctx.save();
      ink();
      ctx.lineWidth = 4 * w;
      ctx.fillStyle = '#8c8372';
      rr(x - 90 * w, y - 12 * w, 180 * w, 22 * w, 5 * w);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#2a2420';
      ctx.beginPath();
      ctx.moveTo(x - 52 * w, y - 12 * w);
      ctx.lineTo(x - 52 * w, y - 62 * w);
      ctx.quadraticCurveTo(x, y - 106 * w, x + 52 * w, y - 62 * w);
      ctx.lineTo(x + 52 * w, y - 12 * w);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    const ty = y - (live3d ? 215 : 120) * w;
    if (n > 0) text('VAULT' + (n > 1 ? ' x' + n : ''), x, ty, 22, (k8 & 4) ? '#8a5a00' : '#4a2f12', u);
    else text('EMPTY', x, ty, 18, '#7a6a52', u);
  };

  // A guard: a helmet, a coat and a rifle held toward g.face; an aiming guard raises it and a "!" stands over him.
  const guard = (g, x, y, w, k8) => {
    ctx.save();
    ink();
    ctx.lineWidth = 3.6 * w;
    ctx.lineCap = 'round';
    const f = g.face || 1, step = g.state === 'come' ? ((k8 >> 1) & 1 ? 6 : -6) * w : 0;
    ctx.fillStyle = g.state === 'stun' ? '#c9c2b0' : '#5a6b4a';
    rr(x - 12 * w, y - 70 * w, 24 * w, 38 * w, 6 * w);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 6 * w, y - 32 * w);
    ctx.lineTo(x - 9 * w + step, y);
    ctx.moveTo(x + 6 * w, y - 32 * w);
    ctx.lineTo(x + 9 * w - step, y);
    ctx.stroke();
    ctx.fillStyle = '#e0c9a0';
    ctx.beginPath();
    ctx.arc(x, y - 82 * w, 11 * w, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#4a5440';
    ctx.beginPath();
    ctx.arc(x, y - 86 * w, 12.5 * w, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const up = g.state === 'aim' ? 8 * w : 0; // the rifle: carried low, raised to aim
    ctx.lineWidth = 4 * w;
    ctx.beginPath();
    ctx.moveTo(x - f * 10 * w, y - 52 * w);
    ctx.lineTo(x + f * 44 * w, y - 54 * w - up);
    ctx.stroke();
    ctx.restore();
    if (g.state === 'aim') text('!', x, y - 112 * w, 34, '#d62828', Math.max(0.6, w * 1.4));
  };

  // Everything, at the CURRENT transform in world units (the 2D pass) or through a projector (the 3D HUD pass: proj(x, y) -> { x, y, u, w } or null).
  const draw = (time, tu = 1, proj = null, live3d = false) => { // (live3d: the 3D view draws the vaults, chests and sacks itself - view3d/treasure3d.js - so only their words, the grab bar and TWO CARRY are drawn here)
    const S = world.away, t = S && S.tre;
    if (!S || !S.on || !t || !t.on) return;
    const k8 = Math.floor(time * 8), K = config.AWAY.TREASURE;
    const at = (x, y) => (proj ? proj(x, y) : { x, y, u: tu, w: 1 + (tu - 1) * 0.6 }); // (zoomed out, the shapes grow a little with the words so a chest still reads from the sofa)
    const labelled = new Set();
    for (const p of Object.values(world.players)) {
      if (!p.on || !p.on.away || p.on.mode !== 'walk' || (p.on.deck && !p.on.deck.derelict)) continue; // (a wreck's deck has crates lying on it too)
      let best = null;
      for (const c of t.chests) if (c.state === 'ground' && Math.abs(p.x - c.x) < K.REACH && (!best || Math.abs(p.x - c.x) < Math.abs(p.x - best.x))) best = c;
      if (best) labelled.add(best);
    }
    for (const v of t.vaults) {
      if (v.state !== 'open' || Math.abs(v.x - S.rope.x) > K.SHOW) continue;
      const q = at(v.x, v.y), n = t.chests.filter((c) => c.vault === v.k && (c.state === 'ground' || c.state === 'carried' || c.state === 'hauled')).length;
      if (q) vault(v, q.x, q.y, q.w, q.u, k8, n, live3d);
    }
    for (const c of t.chests) {
      if (c.state === 'ground') {
        const q = at(c.x, c.y);
        if (!q) continue;
        if (!live3d) chest(q.x, q.y, 1.15 * q.w, c.kind, (k8 & 4) !== 0);
        if (c.prog > 0.02) { // the bar fills while a man holds the button
          ctx.save();
          ctx.strokeStyle = '#2d8a3e';
          ctx.lineWidth = 8 * q.w;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(q.x, q.y - 40 * q.w, 46 * q.w, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, c.prog));
          ctx.stroke();
          ctx.restore();
        }
        if (labelled.has(c)) text(c.label, q.x, q.y - 84 * q.w, 18, '#4a2f12', q.u); // (a label only on the chest a man stands at: three of them side by side run together)
      } else if (c.state === 'carried') { // in the arms of the man who carries it (2D draws it in his hands; the 3D view has no chest for his hands yet, so the HUD holds it over his head)
        const q = at(c.x, c.y - 150);
        if (q) { if (proj && !live3d) chest(q.x, q.y, 0.8 * q.w, c.kind, false); if (c.by.length > 1) text('TWO CARRY', q.x, q.y - 70 * q.w, 17, '#2d6a3e', q.u); }
      } else if (c.state === 'hauled') {
        const q = at(c.x, c.y);
        if (q && !live3d) chest(q.x, q.y + 30 * q.w, 0.8 * q.w, c.kind, true);
      }
    }
    for (const g of t.guards) { if (g.state === 'gone') continue; const q = at(g.x, g.y); if (q) guard(g, q.x, q.y, q.w, k8); }
    ctx.save();
    for (const g of t.guards) { // the line a guard aims along
      if (g.state !== 'aim' || !g.aim) continue;
      const a = at(g.x + (g.face || 1) * 40, g.y - 54), b = at(g.aim.x, g.aim.y);
      if (!a || !b) continue;
      ctx.strokeStyle = 'rgba(214,40,40,0.75)';
      ctx.lineWidth = 3 * a.w;
      ctx.setLineDash([12 * a.w, 9 * a.w]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const s of t.shots) { // a shot: a short bright streak
      const a = at(s.x0, s.y0), b = at(s.x1, s.y1);
      if (!a || !b) continue;
      ctx.strokeStyle = s.hit ? '#ffd23f' : '#fff7e0';
      ctx.lineWidth = 4 * a.w;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + (b.x - a.x) * 0.6, a.y + (b.y - a.y) * 0.6);
      ctx.stroke();
    }
    ctx.restore();
  };

  return { draw, chest };
}
