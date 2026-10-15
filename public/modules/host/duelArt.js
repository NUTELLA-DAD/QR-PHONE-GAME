// THE SWORD FIGHTS, drawn (CASTLE.md package A4; duel.js keeps state.away.duel). The soldiers in a fight - the ones who have left their squad's block to fight a man - are drawn here one by one: running, standing off with the sword
// low, raising it for the blow (a red "!" key over his head with a ring that closes on the moment the blow lands, the same time the phone's cue ring takes), recovering, staggered (the stars), lying down after the third hit, running off.
// A man with his guard up has a shield-arc in front of him: gold while a blow landing now would be a PARRY, blue after. The swing's arc, the hit burst, the parry sparks and the KO are short effects (duel.fx).
// The 3D view draws the fighters itself now (view3d/duel3d.js: real 3D soldiers in held poses, the cutlass in a man's hand, the clash and hit effects) and calls draw with live3d true: nothing is drawn here then. With the 3D view off, or when its kit could not be built, they are 2D shapes on the HUD, through the camera, exactly as the guards are
// (treasureArt.js). Every shape draws at the CURRENT transform and takes the scale of the thing (w) and of the words (u). Nothing wobbles: the legs and the stars step on 1/8 s keys.
import { config } from '../../config.js';

const BODY = '#6b5a4a', HELM = '#9aa0a8', BLADE = '#e8edf2', HILT = '#6b4526', RED = '#d62828', GOLD = '#ffd23f', SHIELD = '#6fb3e8', MEN_SCALE = 1.7 * 1.15, COAT3D = '#b3382e'; // (a fighter is drawn a little larger than the men of a block: the eye goes to him)

export function createDuelArt({ ctx, world, ink }) {
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
  const star = (x, y, r, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath();
    ctx.fill();
  };

  // A sword from the hand at (x, y) pointing at `ang` (radians, 0 = along +x), length len.
  const sword = (x, y, ang, len, w) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = config.INK;
    ctx.lineWidth = 7 * w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + c * len, y + s * len);
    ctx.stroke();
    ctx.strokeStyle = BLADE;
    ctx.lineWidth = 3.4 * w;
    ctx.beginPath();
    ctx.moveTo(x + c * 8 * w, y + s * 8 * w);
    ctx.lineTo(x + c * len, y + s * len);
    ctx.stroke();
    ctx.strokeStyle = HILT; // the cross-guard
    ctx.lineWidth = 4 * w;
    ctx.beginPath();
    ctx.moveTo(x + c * 8 * w - s * 8 * w, y + s * 8 * w + c * 8 * w);
    ctx.lineTo(x + c * 8 * w + s * 8 * w, y + s * 8 * w - c * 8 * w);
    ctx.stroke();
    ctx.restore();
  };

  // One soldier with his feet at (x, y). F = the fighter (st, face, hp, t, tmax, hitT), w = size, k8 = the 1/8 s key.
  const soldier = (F, x, y, w, u, k8, coat = BODY) => {
    const f = F.face || 1, s = MEN_SCALE * w, st = F.st;
    ctx.save();
    ink();
    ctx.lineWidth = 3 * s;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const flash = F.hitT > 0.15;
    if (st === 'down') { // lying on his back: the body flat, the helmet to one side, the sword by his hand, a Zzz
      ctx.fillStyle = flash ? '#fff' : coat;
      ctx.beginPath();
      ctx.rect(x - 30 * s, y - 14 * s, 44 * s, 14 * s);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = HELM;
      ctx.beginPath();
      ctx.arc(x - f * 30 * s, y - 10 * s, 8 * s, 0, 7);
      ctx.fill();
      ctx.stroke();
      sword(x + 18 * s, y - 4 * s, f > 0 ? 0.1 : Math.PI - 0.1, 30 * s, s * 0.8);
      text('z', x + 4 * s, y - 34 * s - (k8 & 4 ? 4 * s : 0), 22, '#5a6a8a', u);
      ctx.restore();
      return;
    }
    const run = st === 'run' || st === 'home' || st === 'flee';
    const step = run ? ((k8 >> 0) & 1 ? 8 : -8) * s : 0;
    const lean = st === 'stagger' ? -f * 9 * s : st === 'tell' ? -f * 4 * s : st === 'recover' ? f * 7 * s : 0; // (back when staggered or winding up, forward after the blow)
    const bx = x + lean;
    ctx.beginPath(); // legs
    ctx.moveTo(bx - 5 * s, y - 24 * s);
    ctx.lineTo(x - 7 * s + step, y);
    ctx.moveTo(bx + 5 * s, y - 24 * s);
    ctx.lineTo(x + 7 * s - step, y);
    ctx.stroke();
    ctx.fillStyle = flash ? '#ffffff' : coat; // body
    ctx.beginPath();
    ctx.rect(bx - 8 * s, y - 52 * s, 16 * s, 30 * s);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = HELM; // head and helmet
    ctx.beginPath();
    ctx.arc(bx, y - 62 * s, 9 * s, 0, 7);
    ctx.fill();
    ctx.stroke();
    // the arm and the sword: low and ready, raised overhead for the blow, down and forward after it, dropped when staggered
    const hx = bx + f * 9 * s, hy = y - 42 * s;
    let ang, hand = [hx, hy];
    if (st === 'tell') { ang = f > 0 ? -2.0 : -Math.PI + 2.0; hand = [bx + f * 4 * s, y - 62 * s]; } // (straight up and a little back)
    else if (st === 'recover') ang = f > 0 ? 0.55 : Math.PI - 0.55;
    else if (st === 'stagger') { ang = f > 0 ? 1.7 : Math.PI - 1.7; hand = [bx + f * 6 * s, y - 36 * s]; }
    else if (run) ang = f > 0 ? -0.35 : Math.PI + 0.35;
    else ang = f > 0 ? -0.9 : Math.PI + 0.9; // ready: the point up and forward
    ctx.beginPath();
    ctx.moveTo(bx + f * 6 * s, y - 48 * s);
    ctx.lineTo(hand[0], hand[1]);
    ctx.stroke();
    sword(hand[0], hand[1], ang, 54 * s, s);
    if (st === 'stagger') for (let i = 0; i < 3; i++) star(bx + Math.cos((k8 >> 1) + i * 2.1) * 22 * s, y - 86 * s + Math.sin((k8 >> 1) + i * 2.1) * 5 * s, 5 * s, GOLD); // (the stars)
    if (st === 'tell') { // the "!" key: a red disc with a white mark, and the ring that closes on the moment of the blow
      const ky = y - 112 * s, r = 19 * s, left = F.tmax ? Math.max(0, F.t / F.tmax) : 1;
      ctx.fillStyle = RED;
      ctx.beginPath();
      ctx.arc(bx, ky, r, 0, 7);
      ctx.fill();
      ctx.stroke();
      text('!', bx, ky + 8 * s, 26, '#ffffff', Math.max(0.6, s * 0.8));
      ctx.strokeStyle = '#fff7e0';
      ctx.lineWidth = 5 * s;
      ctx.beginPath();
      ctx.arc(bx, ky, r + (6 + 26 * left) * s, 0, 7);
      ctx.stroke();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      ctx.arc(bx, ky, r + (6 + 26 * left) * s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - left));
      ctx.stroke();
    } else if (!run) { // his hits to go: pips over his head
      for (let i = 0; i < F.max; i++) {
        ctx.fillStyle = i < F.hp ? RED : '#3a3a3a';
        ctx.beginPath();
        ctx.arc(bx + (i - (F.max - 1) / 2) * 13 * s, y - 80 * s, 4.4 * s, 0, 7);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  // A man's guard: a shield-arc in front of him (gold while a blow landing now is a PARRY).
  const shield = (m, x, y, w, k8) => {
    const dl = m.on && m.on.dl, K = config.AWAY.DUEL;
    if (!dl || !(dl.guard > 0)) return;
    const f = m.face || 1, parry = dl.age <= K.BLOCK.PARRY;
    ctx.save();
    ink();
    ctx.lineWidth = 4 * w;
    ctx.fillStyle = parry ? GOLD : SHIELD;
    ctx.beginPath();
    ctx.ellipse(x + f * 46 * w, y - 70 * w, 12 * w, 40 * w, 0, 0, 7);
    ctx.fill();
    ctx.stroke();
    if (parry && (k8 & 1)) star(x + f * 46 * w, y - 70 * w, 20 * w, '#fff7e0');
    ctx.restore();
  };

  // A man's sword while he swings: back and up for the wind-up, swept forward and down at the blow, held there a moment (the crew art has only an arm for a swing; the sword is drawn here, from the sim's own cool-down).
  const blade = (m, x, y, w) => {
    const dl = m.on && m.on.dl, K = config.AWAY.DUEL;
    if (!dl || !(dl.cd > 0) || m.ko > 0) return;
    const t = K.SWING.CD - dl.cd; // (seconds since the press)
    if (t > 0.4) return;
    const f = m.face || 1, a = t < K.SWING.WIND ? -2.3 + (t / K.SWING.WIND) * 2.6 : 0.3, ww = w * 1.25;
    sword(x + f * 12 * ww, y - 38 * ww, f > 0 ? a : Math.PI - a, 46 * ww, ww * 0.9);
  };

  // The short effects: the swing's arc, the hit burst, the sparks of a block and a parry, the stars of a KO.
  const effect = (e, x, y, w, k8) => {
    const f = e.face || 1, a = e.t / e.life;
    ctx.save();
    ink();
    ctx.lineCap = 'round';
    if (e.k === 'arc') { // a crescent swept in front of the swinger
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 9 * w * (1 - a * 0.6);
      ctx.beginPath();
      ctx.arc(x - f * 30 * w, y + 10 * w, 70 * w, f > 0 ? -1.2 : Math.PI - 0.5, f > 0 ? 0.5 : Math.PI + 1.2);
      ctx.stroke();
    } else if (e.k === 'hit') {
      star(x, y, (22 + 18 * a) * w, '#fff7e0');
    } else if (e.k === 'spark') {
      const big = e.size === 'big';
      star(x, y, (big ? 38 : 24) * w * (1 + a * 0.6), big ? GOLD : '#cfe6ff');
      if (big) star(x, y, 20 * w * (1 + a * 0.6), '#ffffff');
    } else if (e.k === 'ko') {
      for (let i = 0; i < 4; i++) star(x + (i - 1.5) * 20 * w, y - 40 * w - ((k8 + i) & 3) * 4 * w, 6 * w, GOLD);
    }
    ctx.restore();
  };

  // Everything, at the CURRENT transform in world units (the 2D pass) or through a projector (the 3D HUD pass: proj(x, y) -> { x, y, u, w } or null).
  const draw = (time, tu = 1, proj = null, live3d = false) => { // (live3d: the 3D view draws the soldiers, the guard and the blows itself, view3d/duel3d.js: nothing here then)
    const S = world.away, D = S && S.duel;
    if (!S || !S.on || !D || !D.on || live3d) return;
    const k8 = Math.floor(time * 8);
    const at = (x, y) => (proj ? proj(x, y) : { x, y, u: tu, w: 1 + (tu - 1) * 0.6 });
    for (const m of Object.values(world.players)) { // guards up
      if (!m.on || !m.on.away || m.on.mode !== 'walk' || m.ko > 0) continue;
      const q = at(m.x, m.y);
      if (q) { shield(m, q.x, q.y, q.w, k8); blade(m, q.x, q.y, q.w); }
    }
    for (const F of D.foes) {
      const q = at(F.x, F.y);
      if (q) soldier(F, q.x, q.y, q.w, q.u, k8, proj ? COAT3D : BODY); // (over the 3D view: in the red coats of the 3D soldiers beside him)
    }
    for (const e of D.fx) {
      const q = at(e.x, e.y);
      if (q) effect(e, q.x, q.y, q.w, k8);
    }
  };

  return { draw, soldier };
}
