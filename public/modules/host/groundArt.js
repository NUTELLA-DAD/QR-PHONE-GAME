// THE AWAY TEAM, drawn (CASTLE.md package A0; ground.js keeps state.away). The 2D fallback draws the castle walkways and their wall ladders, the ship's ROPE LADDER, a lit FLARE and the PICKUP marker (where the foot of the
// ship should hover) in the world layer; the 3D view has none of these yet (A3 makes the real ones), so render.js draws the same few things on the HUD there, through the 3D camera.
// Every primitive draws at the CURRENT transform and takes two scales: u for the shapes and tu for the words, so the 2D world pass (world units) and the 3D HUD pass (screen pixels) share them.
// Nothing wobbles: pulses are held for 1/8 s.
import { config } from '../../config.js';

const GOLD = '#ffd23f', FLARE = '#ff5a3c', ROPE = '#c9a66b', WOOD = '#8a6444', WOOD_DARK = '#5e4129';

export function createGroundArt({ ctx, world, ink }) {
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

  // A ladder between two points: two rails and rungs every `gap` (the same units as the points).
  const ladder = (x0, y0, x1, y1, u, gap, color = WOOD) => {
    const len = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / len, ny = (x1 - x0) / len, w = 11 * u;
    ctx.save();
    ink();
    ctx.lineCap = 'round';
    for (const [lw, col] of [[7.5 * u, config.INK], [4 * u, color]]) {
      ctx.lineWidth = lw;
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(x0 + nx * w, y0 + ny * w);
      ctx.lineTo(x1 + nx * w, y1 + ny * w);
      ctx.moveTo(x0 - nx * w, y0 - ny * w);
      ctx.lineTo(x1 - nx * w, y1 - ny * w);
      ctx.stroke();
    }
    const n = Math.max(1, Math.floor(len / gap));
    for (const [lw, col] of [[6 * u, config.INK], [3 * u, color]]) {
      ctx.lineWidth = lw;
      ctx.strokeStyle = col;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) { const t = i / n; ctx.moveTo(x0 + (x1 - x0) * t + nx * w, y0 + (y1 - y0) * t + ny * w); ctx.lineTo(x0 + (x1 - x0) * t - nx * w, y0 + (y1 - y0) * t - ny * w); }
      ctx.stroke();
    }
    ctx.restore();
  };

  // A flare: a red burst on a thin beam, "FLARE" over it.
  const flare = (x, y, u, k8, name, tu = u, h = 1) => { // (h: world units to drawn units, for the beam's length and the burst's height)
    ctx.save();
    ink();
    ctx.lineWidth = 3.5 * u;
    ctx.strokeStyle = 'rgba(255,90,60,0.55)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 330 * h);
    ctx.stroke();
    const r = (k8 & 1 ? 30 : 24) * u;
    ctx.fillStyle = FLARE;
    ctx.strokeStyle = config.INK;
    ctx.lineWidth = 3.4 * u;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? r * 0.5 : r; ctx.lineTo(x + Math.cos(a) * rr, y - 350 * h + Math.sin(a) * rr); }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff2b0';
    ctx.beginPath();
    ctx.arc(x, y - 350 * h, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    text('FLARE', x, y - 350 * h - r - 10 * u, 20, FLARE, tu);
    ctx.restore();
  };

  // The pickup marker: a gold ring where the foot of the ship's hatch should hover, an arrow down into it, and the words.
  const pickup = (x, y, u, k8, name, tu = u) => {
    ctx.save();
    ink();
    const r = (k8 & 1 ? 54 : 48) * u;
    ctx.setLineDash([14 * u, 10 * u]);
    ctx.lineWidth = 6 * u;
    ctx.strokeStyle = config.INK;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3.4 * u;
    ctx.strokeStyle = GOLD;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = GOLD;
    ctx.lineWidth = 3.4 * u;
    ctx.strokeStyle = config.INK;
    ctx.beginPath();
    ctx.moveTo(x, y + 22 * u);
    ctx.lineTo(x - 18 * u, y - 6 * u);
    ctx.lineTo(x - 6 * u, y - 6 * u);
    ctx.lineTo(x - 6 * u, y - 24 * u);
    ctx.lineTo(x + 6 * u, y - 24 * u);
    ctx.lineTo(x + 6 * u, y - 6 * u);
    ctx.lineTo(x + 18 * u, y - 6 * u);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    text('PICK UP ' + String(name).toUpperCase(), x, y - r - 12 * u, 22, '#8a4a00', tu);
    ctx.restore();
  };

  // The walkway of a castle face: a plank between two points.
  const plank = (x0, y0, x1, y1, u) => {
    ctx.save();
    ink();
    ctx.lineCap = 'round';
    for (const [lw, col, dy] of [[12 * u, config.INK, 6], [7 * u, WOOD, 6], [3 * u, WOOD_DARK, 11]]) {
      ctx.lineWidth = lw;
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + dy * u);
      ctx.lineTo(x1, y1 + dy * u);
      ctx.stroke();
    }
    ctx.restore();
  };

  // ---- the castle objectives (CASTLE.md A1; objectives.js keeps state.away.obj) ----
  // The little picture on a marker's board, drawn in a box 2 x r wide round (x, y).
  const icon = (kind, x, y, r, col) => {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.fillStyle = col;
    ctx.strokeStyle = config.INK;
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.beginPath();
    if (kind === 'winch') { // a wheel with spokes and a handle
      ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
      for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2 + Math.PI / 4; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62); }
      ctx.moveTo(x + r * 0.45, y - r * 0.45);
      ctx.lineTo(x + r * 0.85, y - r * 0.85);
      ctx.stroke();
    } else if (kind === 'charge') { // a round bomb with a fuse and a spark
      ctx.arc(x, y + r * 0.12, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + r * 0.25, y - r * 0.38);
      ctx.quadraticCurveTo(x + r * 0.5, y - r * 0.75, x + r * 0.75, y - r * 0.6);
      ctx.stroke();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(x + r * 0.78, y - r * 0.62, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 'keg') { // a barrel with two hoops
      ctx.rect(x - r * 0.45, y - r * 0.55, r * 0.9, r * 1.1);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - r * 0.45, y - r * 0.2);
      ctx.lineTo(x + r * 0.45, y - r * 0.2);
      ctx.moveTo(x - r * 0.45, y + r * 0.2);
      ctx.lineTo(x + r * 0.45, y + r * 0.2);
      ctx.stroke();
    } else if (kind === 'ballista') { // a bow with a bolt
      ctx.arc(x - r * 0.2, y, r * 0.7, -1.2, 1.2);
      ctx.moveTo(x - r * 0.7, y);
      ctx.lineTo(x + r * 0.8, y);
      ctx.moveTo(x + r * 0.8, y);
      ctx.lineTo(x + r * 0.55, y - r * 0.2);
      ctx.moveTo(x + r * 0.8, y);
      ctx.lineTo(x + r * 0.55, y + r * 0.2);
      ctx.stroke();
    } else if (kind === 'beacon') { // a flame on a brazier
      ctx.moveTo(x, y - r * 0.8);
      ctx.quadraticCurveTo(x + r * 0.75, y - r * 0.1, x + r * 0.3, y + r * 0.35);
      ctx.lineTo(x - r * 0.3, y + r * 0.35);
      ctx.quadraticCurveTo(x - r * 0.75, y - r * 0.1, x, y - r * 0.8);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - r * 0.45, y + r * 0.55);
      ctx.lineTo(x + r * 0.45, y + r * 0.55);
      ctx.stroke();
    } else if (kind === 'cage') { // a cage: a box with bars
      ctx.rect(x - r * 0.55, y - r * 0.5, r * 1.1, r);
      for (const k of [-0.27, 0, 0.27]) { ctx.moveTo(x + r * k * 1.4, y - r * 0.5); ctx.lineTo(x + r * k * 1.4, y + r * 0.5); }
      ctx.stroke();
    } else if (kind === 'banner') { // a pole with a swallow-tailed flag
      ctx.moveTo(x - r * 0.5, y + r * 0.8);
      ctx.lineTo(x - r * 0.5, y - r * 0.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - r * 0.5, y - r * 0.8);
      ctx.lineTo(x + r * 0.7, y - r * 0.65);
      ctx.lineTo(x + r * 0.4, y - r * 0.3);
      ctx.lineTo(x + r * 0.7, y + r * 0.05);
      ctx.lineTo(x - r * 0.5, y - r * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  };
  // One objective: a signpost standing on the ground with a round board (the icon), a short label over it, a bar while somebody works it and the seconds while a fuse burns.
  const marker = (ob, x, y, u, k8, tu = u) => {
    if (ob.state === 'taken') return; // (the banner is in somebody's arms: the carrier shows it)
    const col = ob.color || '#ffd23f', small = ob.kind === 'keg', r = (small ? 26 : 38) * u, up = (small ? 120 : 190) * u;
    const done = ob.state === 'done';
    ctx.save();
    ctx.globalAlpha = done ? 0.55 : 1;
    ink();
    ctx.lineWidth = 5 * u;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - up + r);
    ctx.stroke();
    ctx.fillStyle = done ? '#cfc7b4' : '#fff7e0';
    ctx.strokeStyle = config.INK;
    ctx.lineWidth = 4 * u;
    const pulse = ob.state === 'ready' && !small && (k8 & 4) ? 3 * u : 0;
    ctx.beginPath();
    ctx.arc(x, y - up, r + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 3 * u;
    ctx.strokeStyle = ob.state === 'fuse' ? '#d62828' : col;
    ctx.beginPath();
    ctx.arc(x, y - up, r - 5 * u, 0, Math.PI * 2);
    ctx.stroke();
    if (done) { // a tick
      ctx.strokeStyle = '#2d8a3e';
      ctx.lineWidth = 7 * u;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.4, y - up);
      ctx.lineTo(x - r * 0.1, y - up + r * 0.35);
      ctx.lineTo(x + r * 0.45, y - up - r * 0.35);
      ctx.stroke();
    } else icon(ob.kind === 'charge' && ob.state === 'fuse' ? 'charge' : ob.kind, x, y - up, r * 0.78, col);
    if (ob.prog > 0.02 && ob.state === 'ready') { // the bar fills while somebody holds
      ctx.strokeStyle = '#2d8a3e';
      ctx.lineWidth = 8 * u;
      ctx.beginPath();
      ctx.arc(x, y - up, r + 8 * u, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, ob.prog));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (ob.state === 'fuse') text(Math.max(0, Math.ceil(ob.t)) + ' s', x, y - up - r - 12 * u, 30, '#d62828', tu);
    else if (!done) text(ob.label, x, y - up - r - 12 * u, small ? 18 : 22, '#4a2f12', tu);
  };
  // A3: when the 3D view draws the sign (post, board and icon), the HUD keeps only the words, the bar that fills and the fuse's seconds, on the 3D board: (x, y) = its centre, rpx = its radius in pixels.
  const markerWords = (ob, x, y, rpx, u, tu) => {
    if (ob.state === 'taken') return;
    if (ob.prog > 0.02 && ob.state === 'ready') {
      ctx.save();
      ctx.strokeStyle = '#2d8a3e';
      ctx.lineWidth = Math.max(3, 8 * u);
      ctx.beginPath();
      ctx.arc(x, y, rpx + 7 * u, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, ob.prog));
      ctx.stroke();
      ctx.restore();
    }
    if (ob.state === 'fuse') text(Math.max(0, Math.ceil(ob.t)) + ' s', x, y - rpx - 12 * u, 30, '#d62828', tu);
    else if (ob.state !== 'done') text(ob.label, x, y - rpx - 12 * u, ob.kind === 'keg' ? 18 : 22, '#4a2f12', tu);
  };
  // A freed prisoner: a small figure in grey with a chain, walking (held poses: no wobble) or climbing.
  const prisoner = (pr, x, y, u, k8) => {
    ctx.save();
    ink();
    ctx.lineWidth = 3.5 * u;
    ctx.fillStyle = '#b8b2a2';
    const step = pr.state === 'walk' ? ((k8 >> 1) & 1 ? 5 : -5) * u : 0;
    ctx.beginPath();
    ctx.arc(x, y - 92 * u, 11 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - 80 * u);
    ctx.lineTo(x, y - 42 * u);
    ctx.moveTo(x, y - 42 * u);
    ctx.lineTo(x - 9 * u + step, y);
    ctx.moveTo(x, y - 42 * u);
    ctx.lineTo(x + 9 * u - step, y);
    ctx.moveTo(x, y - 70 * u);
    ctx.lineTo(pr.state === 'climb' ? x - 14 * u : x - 13 * u, pr.state === 'climb' ? y - 100 * u : y - 55 * u);
    ctx.moveTo(x, y - 70 * u);
    ctx.lineTo(pr.state === 'climb' ? x + 14 * u : x + 13 * u, pr.state === 'climb' ? y - 100 * u : y - 55 * u);
    ctx.stroke();
    ctx.restore();
  };
  // The great banner in a man's arms: a flag over his head.
  const carried = (x, y, u, k8) => {
    ctx.save();
    ink();
    ctx.lineWidth = 4 * u;
    const w = ((k8 >> 1) & 1) * 6 * u;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 150 * u);
    ctx.stroke();
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo(x, y - 150 * u);
    ctx.lineTo(x + 70 * u, y - 140 * u + w);
    ctx.lineTo(x + 52 * u, y - 112 * u);
    ctx.lineTo(x + 70 * u, y - 86 * u - w);
    ctx.lineTo(x, y - 94 * u);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };
  // Every objective, freed prisoner and carried banner, at the CURRENT transform in world units (the 2D pass) or through a projector (the 3D HUD pass: proj(x, y) -> { x, y, u } or null, u = the scale there).
  const drawObjectives = (time, tu = 1, proj = null, live3d = null) => { // (live3d = the 3D view's away layer: it draws the signs, the prisoners and the carried banner itself; signAt(ob) -> { x, y, r } is where a sign board is)
    const S = world.away, O = S && S.obj;
    if (!S || !S.on || !O || !O.on) return;
    const k8 = Math.floor(time * 8);
    const at = (x, y) => (proj ? proj(x, y) : { x, y, u: tu, w: 1 }); // (u: the scale of a sign and its words; w: the scale of a figure standing in the world)
    for (const ob of O.list) {
      if (ob.live === false || Math.abs(ob.x - S.rope.x) > config.AWAY.OBJECTIVES.SHOW) continue; // (its gate has fallen: the winch, the charge and the ballista go with it; a face far from the ship is out of the picture - in 3D the ring's far side shows behind)
      if (live3d) { const sg = live3d.signAt(ob), q3 = at(sg.x, sg.y); if (q3) markerWords(ob, q3.x, q3.y, sg.r * (q3.w / 1.1), q3.u, q3.u); continue; }
      const q = at(ob.x, ob.y);
      if (q) marker(ob, q.x, q.y, q.u, k8, q.u);
    }
    if (live3d) return;
    for (const pr of O.prisoners) { if (pr.state === 'aboard') continue; const q = at(pr.x, pr.y); if (q) prisoner(pr, q.x, q.y, q.w, k8); }
    if (O.banner) { const c = world.players[O.banner.carrier]; if (c && c.on && c.on.away && c.on.mode !== 'home') { const q = at(c.x, c.y - 150); if (q) carried(q.x, q.y, q.w, k8); } }
  };

  // The 2D world pass, with the castle (render.js, under the ships): the walkways and their wall ladders. Only while the away team exists (ground.js S.on).
  const drawGround = () => {
    const S = world.away;
    if (!S || !S.on) return;
    for (const dk of S.decks) plank(dk.x0, dk.y, dk.x1, dk.y, 1);
    for (const l of S.ladders) ladder(l.x, l.y0 + 6, l.x, l.y1, 1, 46);
  };
  // The 2D world pass over the ships (render.js, after the crew in the air): the rope ladder, the flares and the pickup markers, in world units. tu = the words' scale.
  const drawWorld = (time, tu = 1) => {
    const S = world.away;
    if (!S || !S.on) return;
    const k8 = Math.floor(time * 8);
    const R = S.rope;
    drawObjectives(time, tu); // (A1: the castle objectives' markers, the freed prisoners, the carried banner)
    if (R.out && R.len > 4) ladder(R.x, R.y, R.x, R.y + R.len, 1, 40, ROPE);
    for (const p of S.pickups) pickup(p.x, p.y, tu, k8, p.name, tu);
    for (const f of S.flares) flare(f.x, f.y, tu, k8, f.name, tu, 1);
  };

  return { drawGround, drawWorld, drawObjectives, ladder, flare, pickup, plank, text, icon, ROPE };
}
