// DERELICTS AND THE STRANDED BALLOON, drawn (LOOP.md G5 / G6; derelicts.js keeps state.away.der, stopGoals.js state.course.goal). The 2D fallback draws a wreck in the world: a torn hull with its deck, the ribs of a dead gasbag, a rag of
// canvas, the parts still bolted on (each a little machine with a pulse on it and a bar that fills while a man holds the button), the bolt holes where parts were, and the extras (a locker, a trapped sailor, a bat nest). The 3D view has no wreck
// model yet (a later art package: LOOP.md G5 notes), so render.js draws the same wreck on the HUD layer through the 3D camera with `hud3d`: the hull and the thin ribs only, and the parts as flat marks on the deck, so the crew figures
// standing there stay in sight. A DEFEND stop's balloon (a striped envelope, a basket, the crates, a hit-point bar and the wave count) is drawn the same two ways. Every shape draws at the CURRENT transform and takes the scale of the thing (w) and
// of the words (u). Nothing wobbles: pulses are held for 1/8 s.
import { config } from '../../config.js';

const HULL = '#6b5440', HULL_DARK = '#4a3a2c', PLANK = '#8a6c4e', RUST = '#7a4a3a', IRON = '#5a5f66', STEEL = '#b8c4cc', RAG = '#d9cfb5', GOLD = '#ffd23f';

export function createDerelictArt({ ctx, world, ink }) {
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
  const upper = (s) => String(s || '').toUpperCase();

  // A closed (or open) path through world points; false when a point is off the 3D picture.
  const path = (pts, at, close = true) => {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const q = at(pts[i][0], pts[i][1]);
      if (!q) return false;
      i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
    }
    if (close) ctx.closePath();
    return true;
  };
  const shape = (pts, at, fill, lw, close = true) => {
    if (!path(pts, at, close)) return;
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.lineWidth = lw;
    ctx.stroke();
  };
  const curve = (x0, y0, cx, cy, x1, y1, at, lw) => {
    const a = at(x0, y0), c = at(cx, cy), b = at(x1, y1);
    if (!a || !b || !c) return;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
    ctx.lineWidth = lw;
    ctx.stroke();
  };

  // One bolted part, standing on the deck at (x, y): a gun, a lamp, an engine, a plate, a mast, or a crate. hud3d: a flat mark only (the crew figures must stay in sight).
  const partShape = (id, x, y, at, w, hud3d) => {
    const c = at(x, y);
    if (!c) return;
    ctx.save();
    ink();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const lw = 3.4 * c.w;
    if (hud3d) { // (a flat plate on the deck line with the part's initial)
      ctx.fillStyle = STEEL;
      shape([[x - 34, y - 3], [x + 34, y - 3], [x + 26, y - 20], [x - 26, y - 20]], at, STEEL, lw * 0.8);
      ctx.restore();
      return;
    }
    if (id.startsWith('gun')) {
      const len = id === 'gun_long' ? 110 : id === 'gun_mortar' ? 44 : id === 'gun_scatter' ? 56 : id === 'gun_flak' ? 78 : 70, up = id === 'gun_mortar' ? -62 : id === 'gun_flak' ? -34 : -10, thick = id === 'gun_mortar' ? 22 : id === 'gun_scatter' ? 18 : 12;
      shape([[x - 30, y], [x + 30, y], [x + 22, y - 22], [x - 22, y - 22]], at, IRON, lw);
      const a = at(x, y - 28), b = at(x + len * 0.85, y - 28 + up);
      if (a && b) {
        ctx.lineCap = 'butt';
        for (const [t, col] of [[thick + 5, config.INK], [thick, STEEL]]) { ctx.lineWidth = t * c.w; ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        ctx.strokeStyle = config.INK;
      }
    } else if (id === 'lamp') {
      shape([[x - 6, y], [x + 6, y], [x + 4, y - 56], [x - 4, y - 56]], at, IRON, lw);
      shape([[x - 20, y - 56], [x + 22, y - 62], [x + 22, y - 38], [x - 20, y - 38]], at, STEEL, lw);
      shape([[x + 22, y - 62], [x + 34, y - 66], [x + 34, y - 34], [x + 22, y - 38]], at, '#ffe9a8', lw * 0.8);
    } else if (id === 'engine') {
      shape([[x - 38, y], [x + 38, y], [x + 38, y - 44], [x - 38, y - 44]], at, IRON, lw);
      shape([[x - 44, y - 44], [x + 44, y - 44], [x + 44, y - 52], [x - 44, y - 52]], at, RUST, lw * 0.8);
      const h = at(x + 38, y - 22);
      if (h) { ctx.beginPath(); ctx.ellipse(h.x, h.y, 6 * c.w, 30 * c.w, 0, 0, 7); ctx.fillStyle = STEEL; ctx.fill(); ctx.lineWidth = lw * 0.8; ctx.stroke(); }
    } else if (id === 'armour') {
      shape([[x - 12, y], [x + 12, y], [x + 12, y - 78], [x - 12, y - 78]], at, IRON, lw);
      for (const dy of [14, 38, 62]) { const r = at(x, y - dy); if (r) { ctx.beginPath(); ctx.arc(r.x, r.y, 3 * c.w, 0, 7); ctx.fillStyle = STEEL; ctx.fill(); } }
    } else if (id === 'sail') {
      shape([[x - 4, y], [x + 4, y], [x + 3, y - 140], [x - 3, y - 140]], at, HULL_DARK, lw);
      shape([[x + 4, y - 130], [x + 4, y - 40], [x + 70, y - 48]], at, RAG, lw * 0.8);
    } else shape([[x - 28, y], [x + 28, y], [x + 28, y - 42], [x - 28, y - 42]], at, PLANK, lw);
    ctx.restore();
  };

  // A trapped sailor, a locker, a bat nest.
  const extra = (s, x, y, at, k8, hud3d) => {
    const c = at(x, y);
    if (!c) return;
    ctx.save();
    ink();
    ctx.lineWidth = 3.4 * c.w;
    if (s.kind === 'cache') {
      shape([[x - 30, y], [x + 30, y], [x + 30, y - 34], [x - 30, y - 34]], at, PLANK, 3.4 * c.w);
      const g = at(x, y - 24);
      if (g) { ctx.fillStyle = (k8 & 4) ? '#fff2b0' : GOLD; ctx.fillRect(g.x - 5 * c.w, g.y - 8 * c.w, 10 * c.w, 14 * c.w); }
    } else if (s.kind === 'survivor') {
      const head = at(x, y - 66), body = at(x, y - 20);
      if (head && body) {
        ctx.beginPath(); ctx.arc(head.x, head.y, 11 * c.w, 0, 7); ctx.fillStyle = '#e0c9a0'; ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#6b8fb8'; ctx.fillRect(body.x - 11 * c.w, body.y - 18 * c.w, 22 * c.w, 38 * c.w); ctx.strokeRect(body.x - 11 * c.w, body.y - 18 * c.w, 22 * c.w, 38 * c.w);
        const arm = (k8 & 2) ? -30 : -18;
        ctx.beginPath(); ctx.moveTo(body.x + 10 * c.w, body.y - 14 * c.w); ctx.lineTo(body.x + 26 * c.w, body.y + arm * c.w); ctx.stroke();
      }
      if (!hud3d) text('HELP!', c.x, c.y - 94 * c.w, 17, '#b3261e', c.u);
    } else if (s.kind === 'nest') {
      const n = at(x, y - 24);
      if (n) {
        ctx.beginPath(); ctx.ellipse(n.x, n.y, 34 * c.w, 22 * c.w, 0, 0, 7); ctx.fillStyle = '#2a2420'; ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e63946';
        for (const dx of [-10, 10]) { ctx.beginPath(); ctx.arc(n.x + dx * c.w, n.y - 3 * c.w, 3.4 * c.w, 0, 7); ctx.fill(); }
      }
    }
    ctx.restore();
  };

  // A wreck: d = { x (deck middle), y (deck), w, parts, surprise, name }.
  const wreck = (d, at, tu, k8, hud3d, near) => {
    const c = at(d.x, d.y);
    if (!c) return;
    const hw = d.w / 2, y = d.y, x = d.x;
    ctx.save();
    ink();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.globalAlpha = hud3d ? 0.9 : 1;
    const lw = 4 * c.w;
    const seed = d.seed || 1, jag = (i) => ((seed >> i) & 3) * 7; // (the broken stern: a different tear for each wreck)
    // the ribs of the dead gasbag and a rag of canvas (above the deck; thin lines in the 3D view)
    ctx.strokeStyle = '#5b5f66';
    for (const f of [-0.62, -0.3, 0.02, 0.34]) curve(x + hw * f, y, x + hw * (f + 0.1), y - 240 - jag(2) * 3, x + hw * (f + 0.5), y - 40 - jag(4), at, (hud3d ? 3 : 6) * c.w);
    if (!hud3d) {
      shape([[x - hw * 0.4, y - 62], [x - hw * 0.05, y - 130], [x + hw * 0.1, y - 70], [x - hw * 0.1, y - 40]], at, 'rgba(217,207,181,.8)', 2.4 * c.w);
    }
    ink();
    // the hull: a keel with the stern torn off
    shape([[x - hw, y], [x + hw, y], [x + hw - 22, y + 46], [x + hw - 84, y + 88], [x + hw - 250, y + 100], [x - hw + 150, y + 96], [x - hw + 62 + jag(0), y + 70], [x - hw + 16, y + 56 + jag(6)], [x - hw + 40, y + 30], [x - hw + 4, y + 18]], at, HULL, lw);
    // planks and the deck
    ctx.strokeStyle = HULL_DARK;
    for (const f of [0.35, 0.65]) { const a = at(x - hw + 24, y + 100 * f), b = at(x + hw - 30, y + 100 * f - 8); if (a && b) { ctx.lineWidth = 1.8 * c.w; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } }
    ink();
    shape([[x - hw, y - 7], [x + hw, y - 7], [x + hw, y + 2], [x - hw, y + 2]], at, PLANK, lw * 0.9);
    // a stump of a cabin at the bow end
    if (!hud3d) {
      shape([[x + hw - 150, y - 7], [x + hw - 150, y - 76], [x + hw - 98, y - 96], [x + hw - 30, y - 64], [x + hw - 30, y - 7]], at, '#7d6347', lw * 0.9);
      shape([[x + hw - 128, y - 52], [x + hw - 84, y - 52], [x + hw - 84, y - 30], [x + hw - 128, y - 30]], at, '#2a2420', lw * 0.6);
    }
    // the name on the hull
    if (!hud3d || near) text(upper(d.name), c.x, c.y + 70 * c.w, 18, '#4a2f12', c.u);
    // the parts (a part is named on the hull under it when somebody stands near it)
    const bolts = d.parts.filter((p) => p.state === 'bolted').length;
    const men = Object.values(world.players).filter((p) => p.on && p.on.away && p.on.deck === d.deck);
    for (const part of d.parts) {
      const px = x + part.dx;
      if (part.state === 'bolted') {
        const g = at(px, y - 30);
        if (g && (k8 & 4)) { ctx.beginPath(); ctx.arc(g.x, g.y, 54 * c.w, 0, 7); ctx.fillStyle = 'rgba(255,248,214,.22)'; ctx.fill(); }
        partShape(part.id, px, y - 7, at, c.w, hud3d);
        const q = at(px, y);
        if (q && (part.prog > 0.02 || men.some((m) => Math.abs(m.x - px) < 150))) text(upper(part.label), q.x, q.y + 34 * q.w, 17, '#33424f', q.u);
        if (q && part.prog > 0.02) { ctx.strokeStyle = '#2d8a3e'; ctx.lineWidth = 8 * q.w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(q.x, q.y - 52 * q.w, 46 * q.w, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, part.prog)); ctx.stroke(); }
      } else { // bolt holes where a part was
        ctx.fillStyle = HULL_DARK;
        for (const dx of [-16, 16]) { const q = at(px + dx, y - 3); if (q) { ctx.beginPath(); ctx.arc(q.x, q.y, 3.4 * q.w, 0, 7); ctx.fill(); } }
      }
    }
    const s = d.surprise;
    if (s && s.state === 'ready') {
      extra(s, x + s.dx, y - 7, at, k8, hud3d);
      const q = at(x + s.dx, y);
      if (q && s.prog > 0.02) { ctx.strokeStyle = '#2d8a3e'; ctx.lineWidth = 8 * q.w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(q.x, q.y - 52 * q.w, 46 * q.w, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, s.prog)); ctx.stroke(); }
    }
    if (near && bolts) text('STRIP ' + bolts + (bolts === 1 ? ' PART' : ' PARTS'), c.x, c.y + 118 * c.w, 16, '#4a2f12', c.u);
    ctx.restore();
  };

  // The stranded balloon of a DEFEND stop: the striped envelope, the basket and its crates; a hit-point bar, WAVE n, and a worn look as it is chewed.
  const balloon = (g, at, tu, k8) => {
    const c = at(g.x, g.y - 150);
    if (!c) return;
    const f = Math.max(0, g.hp / g.max), x = g.x, y = g.y;
    ctx.save();
    ink();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.4 * c.w;
    const e = at(x, y - 210), r = c.w * 96;
    if (e) {
      for (let k = 0; k < 6; k++) {
        ctx.fillStyle = k % 2 ? '#ffffff' : '#a8443f';
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, r, r * 1.2, 0, -Math.PI / 2 + (k * Math.PI) / 3 - Math.PI / 2, -Math.PI / 2 + ((k + 1) * Math.PI) / 3 - Math.PI / 2);
        ctx.lineTo(e.x, e.y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, r, r * 1.2, 0, 0, 7);
      ctx.stroke();
      if (f < 0.7) { ctx.fillStyle = 'rgba(42,36,32,.55)'; for (const [dx, dy] of [[-0.4, 0.2], [0.35, -0.3], [0.1, 0.5]].slice(0, f < 0.35 ? 3 : 2)) { ctx.beginPath(); ctx.ellipse(e.x + dx * r, e.y + dy * r, r * 0.22, r * 0.16, 0.5, 0, 7); ctx.fill(); } } // (chewed through)
    }
    shape([[x - 52, y - 100], [x - 30, y - 6], [x - 26, y - 6], [x - 44, y - 100]], at, null, 2.4 * c.w, false);
    shape([[x + 52, y - 100], [x + 30, y - 6], [x + 26, y - 6], [x + 44, y - 100]], at, null, 2.4 * c.w, false);
    shape([[x - 42, y - 6], [x + 42, y - 6], [x + 42, y + 52], [x - 42, y + 52]], at, '#a0784a', 3.4 * c.w);
    shape([[x - 28, y - 22], [x - 4, y - 22], [x - 4, y - 6], [x - 28, y - 6]], at, '#d9b36a', 2.4 * c.w);
    const bt = at(x, y - 360);
    if (bt) {
      const bw = 190 * bt.w, bh = 20 * bt.w;
      ctx.fillStyle = 'rgba(43,38,34,.82)';
      ctx.fillRect(bt.x - bw / 2 - 3, bt.y - bh / 2 - 3, bw + 6, bh + 6);
      ctx.fillStyle = f > 0.5 ? '#2d8a3e' : f > 0.25 ? '#e0a020' : '#c62828';
      ctx.fillRect(bt.x - bw / 2, bt.y - bh / 2, bw * f, bh);
      text('BALLOON  ' + Math.round(g.hp) + '%', bt.x, bt.y - 18 * bt.w, 20, '#4a2f12', bt.u);
    }
    void tu; void k8;
    ctx.restore();
  };

  // Everything, at the CURRENT transform in world units (the 2D pass) or through a projector (the 3D HUD pass: proj(x, y) -> { x, y, u, w } or null).
  const draw = (time, tu = 1, proj = null, hud3d = false) => {
    const S = world.away, c = world.course;
    const at = (x, y) => (proj ? proj(x, y) : { x, y, u: tu, w: 1 + (tu - 1) * 0.6 });
    const k8 = Math.floor(time * 8);
    const rx = S && S.rope ? S.rope.x : 0;
    for (const d of (S && S.der && S.der.list) || []) {
      if (d.fate === 'sunk') continue;
      wreck(d, at, tu, k8, hud3d, S.on && Math.abs(d.x - rx) < 2600);
    }
    const g = c && c.goal;
    if (g && g.kind === 'defend' && !(g.done && !g.win)) balloon(g, at, tu, k8);
  };

  // ---- the TV's words and small marks ----
  const fmt = (t) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  // The goal readout under the minimap (render.js drawMini): km = how far to the next place to be, or null.
  const goalText = (c, km) => {
    const g = c.goal;
    if (!g) return null;
    if (g.kind === 'salvage') return g.done ? (g.win ? 'SALVAGE RUN COMPLETE!' : 'THE STORM TOOK THE WRECKS') : 'PARTS ' + g.have + '/' + g.need + ' - STORM IN ' + fmt(g.t) + (km !== null && km > 0.5 ? ' - ' + km.toFixed(1) + ' km' : '');
    if (g.done) return g.win ? 'THE BALLOON IS SAFE!' : 'THE BALLOON IS LOST';
    return g.live ? 'BALLOON ' + Math.round(g.hp) + '% - HOLD ' + fmt(g.t) + (g.wave ? ' - WAVE ' + g.wave : '') : 'FLY TO THE BALLOON' + (km !== null ? ' - ' + km.toFixed(1) + ' km' : '');
  };
  // The wrecks and the balloon on the minimap: px(mx), py(my) map a world point to the small map.
  const mini = (px, py) => {
    const S = world.away, c = world.course;
    ctx.save();
    ctx.lineWidth = 2;
    for (const d of (S && S.der && S.der.list) || []) {
      const open = d.parts.some((p) => p.state === 'bolted');
      ctx.fillStyle = open ? '#7fb2d9' : '#888';
      ctx.beginPath();
      ctx.rect(px(d.x) - 5, py(d.y) - 3, 10, 6);
      ctx.fill();
      ctx.stroke();
    }
    const g = c && c.goal;
    if (g && g.kind === 'defend' && !(g.done && !g.win)) { ctx.fillStyle = '#ff8c1a'; ctx.beginPath(); ctx.arc(px(g.x), py(g.y - 150), 7, 0, 7); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  };

  return { draw, goalText, mini, wreck, balloon, partShape };
}
