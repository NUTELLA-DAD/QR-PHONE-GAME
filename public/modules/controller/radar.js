// The phone radar: a round map with the ship in the middle, a turning sweep line and a blip for
// everything the TV knows about, even far past the edge of the TV picture. Tap a blip to SPOT it.
// The host sends { on: 1, s: seq, a: [kind, x, y, flags, ...] } a few times a second (x, y: -100..100 of the
// radar's radius; flags: 1 = already spotted, 2 = beyond the rim, shown pinned to the edge).
// The kinds are in the same order as RADAR_KINDS in host/spotter.js.
const KINDS = [
  { c: '#ffb347', r: 4.5, shape: 'dia' }, // mine
  { c: '#ff5a4d', r: 5.5, shape: 'tri' }, // fighter
  { c: '#ff8a8a', r: 7.5, shape: 'tri' }, // bomber
  { c: '#ff5a4d', r: 4.5, shape: 'tri' }, // plane (squadron)
  { c: '#ff2e55', r: 11, shape: 'sq' }, // boss
  { c: '#ff7b00', r: 10, shape: 'sq' }, // gunship
  { c: '#c9a0ff', r: 3.5, shape: 'dot' }, // bat
  { c: '#ffe27a', r: 5.5, shape: 'dia' }, // sniper
  { c: '#d9a05b', r: 5.5, shape: 'dia' }, // harpoon tug
  { c: '#9fdcff', r: 5, shape: 'dot' }, // saw
  { c: '#ff9ad0', r: 3.5, shape: 'dot' }, // imp
];
const TAU = Math.PI * 2;

export function createRadar({ canvas, box }) {
  const ctx = canvas.getContext('2d');
  let items = []; // { k, x, y, spotted, far } with x, y as a fraction of the radius (-1..1)
  let seq = 0;
  let on = false;
  let size = 0; // CSS px
  let dpr = 1;
  let raf = 0;
  let lastDraw = 0;
  let tapped = null; // { x, y, t } a tap flash

  const fit = () => {
    const s = Math.max(0, Math.floor(Math.min(box.clientWidth, box.clientHeight)) - 2);
    if (!s || s === size) return;
    size = s;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.style.width = canvas.style.height = size + 'px';
    canvas.width = canvas.height = Math.round(size * dpr);
  };

  const shape = (kind, x, y, r) => {
    ctx.beginPath();
    if (kind.shape === 'dot') ctx.arc(x, y, r, 0, TAU);
    else if (kind.shape === 'sq') ctx.rect(x - r, y - r, r * 2, r * 2);
    else if (kind.shape === 'dia') {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
    } else {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y + r * 0.8);
      ctx.lineTo(x - r, y + r * 0.8);
      ctx.closePath();
    }
  };

  const draw = (now) => {
    raf = on ? requestAnimationFrame(draw) : 0;
    if (now - lastDraw < 33) return; // ~30 fps is plenty
    lastDraw = now;
    fit();
    if (!size) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = size / 2;
    const R = c - 8; // radar radius in px (blips can sit right on the rim)
    ctx.clearRect(0, 0, size, size);
    // face
    const g = ctx.createRadialGradient(c, c, 4, c, c, c);
    g.addColorStop(0, '#12402a');
    g.addColorStop(1, '#08180f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, c - 1, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,255,170,.28)';
    ctx.lineWidth = 1.5;
    for (const f of [1 / 3, 2 / 3, 1]) {
      ctx.beginPath();
      ctx.arc(c, c, R * f, 0, TAU);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(c - R, c);
    ctx.lineTo(c + R, c);
    ctx.moveTo(c, c - R);
    ctx.lineTo(c, c + R);
    ctx.stroke();
    // sweep: a bright line with a fading wedge behind it
    const sweep = ((now / 2600) % 1) * TAU;
    for (let k = 0; k < 18; k++) {
      ctx.fillStyle = `rgba(90,255,150,${0.22 * (1 - k / 18)})`;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, R, sweep - (k + 1) * 0.07, sweep - k * 0.07);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(160,255,190,.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + Math.cos(sweep) * R, c + Math.sin(sweep) * R);
    ctx.stroke();
    // the ship
    ctx.fillStyle = '#f1e2b8';
    ctx.strokeStyle = '#1b1410';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(c, c - 1, 11, 5, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#a8443f';
    ctx.fillRect(c - 4, c + 3, 8, 4);
    // blips
    for (const it of items) {
      const kind = KINDS[it.k] || KINDS[0];
      const x = c + it.x * R;
      const y = c + it.y * R;
      const ang = Math.atan2(it.y, it.x);
      const since = (((sweep - ang) % TAU) + TAU) % TAU; // how long ago the sweep passed this blip
      const glow = since < 1.4 ? 1 - since / 1.4 : 0;
      ctx.globalAlpha = (it.far ? 0.45 : 0.6) + 0.4 * glow;
      if (glow > 0.05) {
        ctx.fillStyle = kind.c;
        ctx.globalAlpha *= 0.35;
        ctx.beginPath();
        ctx.arc(x, y, kind.r + 4 + glow * 6, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = (it.far ? 0.45 : 0.6) + 0.4 * glow;
      }
      ctx.fillStyle = kind.c;
      shape(kind, x, y, kind.r);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (it.far) {
        // beyond the rim: hollow ring says "farther than this"
        ctx.strokeStyle = kind.c;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, kind.r + 3, 0, TAU);
        ctx.stroke();
      }
      if (it.spotted) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 160);
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 2.5;
        const b = kind.r + 6 + pulse * 2;
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          ctx.beginPath();
          ctx.moveTo(x + sx * b, y + sy * (b - 5));
          ctx.lineTo(x + sx * b, y + sy * b);
          ctx.lineTo(x + sx * (b - 5), y + sy * b);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    if (tapped && now - tapped.t < 400) {
      const k = (now - tapped.t) / 400;
      ctx.strokeStyle = `rgba(255,210,63,${1 - k})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(tapped.x, tapped.y, 8 + k * 26, 0, TAU);
      ctx.stroke();
    }
    if (!items.length) {
      ctx.fillStyle = 'rgba(160,255,190,.8)';
      ctx.font = "700 11px 'Libre Baskerville', Georgia, serif";
      ctx.textAlign = 'center';
      ctx.fillText('ALL CLEAR', c, c + R * 0.55);
    }
    ctx.strokeStyle = '#1b1410';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(c, c, c - 1.5, 0, TAU);
    ctx.stroke();
  };

  // New data from the host (or { on: 0 } to switch off).
  const set = (rd) => {
    if (!rd || !rd.on) {
      on = false;
      items = [];
      return false;
    }
    seq = rd.s || 0;
    const a = rd.a || [];
    items = [];
    for (let i = 0; i + 3 < a.length; i += 4) items.push({ k: a[i], x: a[i + 1] / 100, y: a[i + 2] / 100, spotted: !!(a[i + 3] & 1), far: !!(a[i + 3] & 2) });
    if (!on) {
      on = true;
      lastDraw = 0;
      if (!raf) raf = requestAnimationFrame(draw);
    }
    return true;
  };

  // Which blip did a finger land on? Generous: any blip within about a thumb-width counts, nearest first.
  const pick = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const c = size / 2;
    const R = c - 8;
    let best = -1;
    let bestD = 34; // px
    items.forEach((it, i) => {
      const d = Math.hypot(c + it.x * R - px, c + it.y * R - py) - (KINDS[it.k] || KINDS[0]).r * 0.5;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) tapped = { x: c + items[best].x * R, y: c + items[best].y * R, t: performance.now() };
    return best >= 0 ? { i: best, s: seq } : null;
  };

  return { set, pick, fit, isOn: () => on };
}
