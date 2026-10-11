// The look of the round portholes (portholes.js plans them): a rim, rivets, a pointer notch toward the thing it shows, a little plate with the name and the distance, and for the lookout's SPYGLASS
// a cross-hair and a ring round every target in the lens (filling while it is being made out, gold once spotted). Drawn on the 2D canvas, over the picture (the picture is the 3D scene drawn by
// view3d/portholes.js, or - in 2D, and when 3D could not draw it - drawPicture below, supplied by render.js). Storybook style like the Versus spyglass frame (render.js drawInset): a coloured rim,
// an ink line each side, brass rivets. A friend's rim is GREEN, the lookout's spyglass is brass. No wobble: nothing here moves except with the data. Never throws.
import { config } from '../../config.js';

const KIND_WORDS = { mine: 'MINE', fighter: 'FIGHTER', bomber: 'BOMBER', plane: 'PLANE', boss: 'BOSS', gunship: 'GUNSHIP', bat: 'BAT', sniper: 'SNIPER', tug: 'HARPOON', saw: 'SAW', imp: 'IMP', creature: 'CREATURE' };

export function createPortholeArt({ ctx }) {
  const INK = () => config.INK;
  const C = () => config.PORTHOLES.COLORS;
  const circle = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, Math.max(1, r), 0, Math.PI * 2); };

  // the picture's clip: call before drawing the scene, restore after (render.js)
  const clipCircle = (it) => { circle(it.x, it.y, it.r * (1 - config.PORTHOLES.RIM * 0.55)); ctx.clip(); };

  const plate = (text, x, y, w, size, color) => {
    ctx.font = '700 ' + size + 'px ' + config.FONTS.TEXT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * 0.28);
    ctx.strokeStyle = '#fff7e0';
    ctx.strokeText(text, x, y, w);
    ctx.fillStyle = color || INK();
    ctx.fillText(text, x, y, w);
  };

  const rim = (it, u) => {
    const P = config.PORTHOLES, K = C(), r = it.r, rw = r * P.RIM, mid = r - rw / 2;
    const spy = it.ring === 'spy';
    const col = spy ? K.brass : K.friend, dark = spy ? K.brassDark : K.friendDark;
    // the rim: an ink line outside, the colour, a thin brass line inside, an ink line inside
    circle(it.x, it.y, r + 1.5 * u); ctx.lineWidth = 3 * u; ctx.strokeStyle = INK(); ctx.stroke();
    circle(it.x, it.y, mid); ctx.lineWidth = rw; ctx.strokeStyle = col; ctx.stroke();
    circle(it.x, it.y, r - rw * 0.2); ctx.lineWidth = Math.max(1.5, rw * 0.12); ctx.strokeStyle = dark; ctx.stroke();
    if (!spy) { circle(it.x, it.y, r - rw * 0.78); ctx.lineWidth = Math.max(1.5, rw * 0.14); ctx.strokeStyle = K.brass; ctx.stroke(); }
    circle(it.x, it.y, r - rw); ctx.lineWidth = 2.5 * u; ctx.strokeStyle = INK(); ctx.stroke();
    // rivets round the rim
    const n = spy ? 12 : 8;
    ctx.fillStyle = K.brass;
    ctx.lineWidth = 1.6 * u;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      circle(it.x + Math.cos(a) * mid, it.y + Math.sin(a) * mid, Math.max(2, rw * 0.17));
      ctx.fill();
      ctx.strokeStyle = INK();
      ctx.stroke();
    }
    // a still glint on the glass (top left): no animation
    ctx.save();
    ctx.globalAlpha *= 0.28;
    ctx.strokeStyle = K.glass;
    ctx.lineWidth = Math.max(2, r * 0.05);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(it.x, it.y, r - rw - Math.max(4, r * 0.1), Math.PI * 1.08, Math.PI * 1.38);
    ctx.stroke();
    ctx.restore();
  };

  // the pointer notch on the rim, toward the thing
  const notch = (it, u) => {
    if (it.kind !== 'edge') return;
    const a = it.ang, r = it.r, K = C();
    ctx.save();
    ctx.translate(it.x + Math.cos(a) * r, it.y + Math.sin(a) * r);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(15 * u, 0);
    ctx.lineTo(-3 * u, -11 * u);
    ctx.lineTo(-3 * u, 11 * u);
    ctx.closePath();
    ctx.fillStyle = K.friend;
    ctx.fill();
    ctx.lineWidth = 2.6 * u;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK();
    ctx.stroke();
    ctx.restore();
  };

  const spyInside = (it, u, time) => {
    const K = C(), r = it.r - it.r * config.PORTHOLES.RIM;
    ctx.save();
    circle(it.x, it.y, r); ctx.clip();
    // cross-hair
    ctx.strokeStyle = 'rgba(27,20,16,0.45)';
    ctx.lineWidth = 1.6 * u;
    ctx.beginPath();
    ctx.moveTo(it.x - r, it.y); ctx.lineTo(it.x - r * 0.18, it.y);
    ctx.moveTo(it.x + r * 0.18, it.y); ctx.lineTo(it.x + r, it.y);
    ctx.moveTo(it.x, it.y - r); ctx.lineTo(it.x, it.y - r * 0.18);
    ctx.moveTo(it.x, it.y + r * 0.18); ctx.lineTo(it.x, it.y + r);
    ctx.stroke();
    circle(it.x, it.y, r * 0.5); ctx.setLineDash([4 * u, 7 * u]); ctx.stroke(); ctx.setLineDash([]);
    // a ring round each target: filling while it is made out, gold when spotted
    for (const m of it.marks || []) {
      const x = it.x + m.dx, y = it.y + m.dy, rr = 11 * u;
      circle(x, y, rr); ctx.lineWidth = 4.2 * u; ctx.strokeStyle = INK(); ctx.stroke();
      circle(x, y, rr); ctx.lineWidth = 2.4 * u; ctx.strokeStyle = m.spotted ? '#ffd23f' : '#fff7e0'; ctx.stroke();
      if (!m.spotted && m.prog > 0) { ctx.beginPath(); ctx.arc(x, y, rr, -Math.PI / 2, -Math.PI / 2 + m.prog * Math.PI * 2); ctx.lineWidth = 3 * u; ctx.strokeStyle = '#e8863a'; ctx.stroke(); }
    }
    ctx.restore();
    void K; void time;
  };

  // items = portholes.plan().items; live = Set of ids whose picture the 3D view drew; drawPicture(it) draws the 2D picture for the ones it did not.
  const draw = (items, { live, drawPicture, time = 0, w, h } = {}) => {
    const u = Math.max(0.7, (h || 900) / 900);
    for (const it of items || []) {
      try {
        if (!(it.a > 0)) continue;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = Math.min(1, it.a);
        if (live && live.has(it.id)) { // the picture is the 3D one underneath: clear the HUD's own pixels in the window (name labels and the like drawn there earlier) so it shows through
          ctx.save();
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'destination-out';
          circle(it.x, it.y, it.r * (1 - config.PORTHOLES.RIM * 0.4));
          ctx.fill();
          ctx.restore();
        } else if (drawPicture) { ctx.save(); circle(it.x, it.y, it.r); ctx.fillStyle = '#e8dcc0'; ctx.fill(); clipCircle(it); drawPicture(it); ctx.restore(); }
        if (it.kind === 'spy') spyInside(it, u, time);
        rim(it, u);
        notch(it, u);
        // the plate: where it is and how far (below the window; above it near the bottom of the screen)
        const size = Math.round(15 * u), pw = it.r * 2.3, ph = it.kind === 'spy' ? size * 2.5 : size * 1.5;
        let py = it.y + it.r + 8 * u;
        if (py + ph > (h || 900) - 4) py = it.y - it.r - 8 * u - ph;
        const px = Math.max(4, Math.min((w || 1600) - pw - 4, it.x - pw / 2));
        ctx.beginPath();
        ctx.roundRect(px, py, pw, ph, 7 * u);
        ctx.fillStyle = 'rgba(243,234,214,0.94)'; ctx.fill();
        ctx.lineWidth = 2.4 * u; ctx.strokeStyle = INK(); ctx.stroke();
        const col = it.kind === 'spy' ? C().brassDark : C().friendDark;
        if (it.kind === 'spy') {
          plate(it.label, px + pw / 2, py + size * 1.08, pw - 10 * u, size, col);
          plate(it.sub || '', px + pw / 2, py + size * 2.15, pw - 10 * u, Math.round(size * 0.78), config.LOGBOOK ? config.LOGBOOK.INK_SOFT : INK());
        } else plate((it.count > 1 ? 'x' + it.count + ' ' : '') + (it.count > 1 ? 'FRIENDS' : it.sub) + '  ' + it.label, px + pw / 2, py + size * 1.08, pw - 10 * u, size, col);
        if (it.kind === 'edge' && it.count > 1) { // the count on a round badge, top right of the rim
          const bx = it.x + it.r * 0.72, by = it.y - it.r * 0.72, br = 13 * u;
          circle(bx, by, br); ctx.fillStyle = '#fff7e0'; ctx.fill(); ctx.lineWidth = 2.4 * u; ctx.strokeStyle = INK(); ctx.stroke();
          plate('x' + it.count, bx, by + 5 * u, br * 2, Math.round(13 * u), C().friendDark);
        }
        ctx.restore();
      } catch (e) { try { ctx.restore(); } catch (e2) { /* ignore */ } }
    }
  };

  return { draw, clipCircle, KIND_WORDS };
}
