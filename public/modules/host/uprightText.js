// Upright text on a mirrored ship (MOVEMENT.md, M.3). Node-safe: it touches nothing until a canvas context is handed in.
//
// A ship that has come about is drawn under a mirror (render.js: scale(f, 1) with f = -1), so every label drawn inside her layer (station names, ammo counts, "BROKEN",
// "EMPTY!", HELP! call-outs, the names over the crew ...) would read backwards. installUprightText(ctx) wraps ctx.fillText and ctx.strokeText the same way style.js wraps the
// path functions: when the transform that is in force at the moment of the call is a mirror (negative determinant), the text is drawn under a second, local mirror at its
// own anchor, so the letters read the right way round. A label that was left-aligned (it ran toward the ship's bow) is right-aligned in the mirrored picture, so it still
// sits on the same side of its anchor. With the ordinary, unmirrored transform nothing changes at all.
const SWAP = { left: 'right', start: 'right', right: 'left', end: 'left' };

export function installUprightText(ctx) {
  if (!ctx || ctx.__upright || typeof ctx.getTransform !== 'function') return;
  ctx.__upright = true;
  const wrap = (name) => {
    const orig = ctx[name].bind(ctx);
    ctx[name] = (text, x, y, maxWidth) => {
      const m = ctx.getTransform();
      if (m.a * m.d - m.b * m.c >= 0) return maxWidth === undefined ? orig(text, x, y) : orig(text, x, y, maxWidth);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(-1, 1);
      ctx.textAlign = SWAP[ctx.textAlign] || ctx.textAlign;
      if (maxWidth === undefined) orig(text, 0, 0);
      else orig(text, 0, 0, maxWidth);
      ctx.restore();
    };
  };
  wrap('fillText');
  wrap('strokeText');
}
