// Draws the airship from SHIP_LAYOUT (placeholder vector art until Phase 3).
// Everything is in ship coordinates; render.js has already shifted for altitude.
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';

const L = SHIP_LAYOUT;
const P = L.platforms;
const INK = config.INK;
const WOOD = '#8a5a34';
const WOOD_DARK = '#3b2a1d';
const IRON = '#4a4a4a';

export function createShipArt({ ctx, state, ink, rrect }) {
  let liftY = P[L.connectors.find((c) => c.type === 'lift').bottom].y;

  const line = (pts, width = 5, color = INK) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };

  const filled = (color, path) => {
    ink();
    ctx.fillStyle = color;
    ctx.beginPath();
    path();
    ctx.fill();
    ctx.stroke();
  };

  // ---- Big pieces ----
  const gondolaPath = () => {
    ctx.moveTo(130, 480);
    ctx.lineTo(1430, 480);
    ctx.quadraticCurveTo(1512, 484, 1512, 600);
    ctx.quadraticCurveTo(1508, 650, 1470, 662);
    ctx.lineTo(1352, 815);
    ctx.lineTo(248, 815);
    ctx.lineTo(126, 662);
    ctx.closePath();
  };

  const drawGasbag = () => {
    // Tail fins (behind the envelope, at the stern = left).
    filled('#a0522d', () => {
      ctx.moveTo(40, 170);
      ctx.lineTo(-95, 70);
      ctx.lineTo(-80, 200);
      ctx.closePath();
    });
    filled('#a0522d', () => {
      ctx.moveTo(40, 320);
      ctx.lineTo(-95, 420);
      ctx.lineTo(-80, 290);
      ctx.closePath();
    });
    filled('#d9c18f', () => ctx.ellipse(800, 245, 860, 185, 0, 0, 7));
    ctx.lineWidth = 3;
    for (let i = -5; i <= 5; i++) {
      ctx.beginPath();
      const side = i < 0 ? Math.PI : 0;
      ctx.ellipse(800, 245, (860 * Math.abs(i)) / 5.6 + 4, 185, 0, side - 1.57, side + 1.57);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-60, 245);
    ctx.lineTo(1660, 245);
    ctx.stroke();
    // Rigging down to the gondola.
    for (const x of [260, 520, 800, 1080, 1340]) line([[x - 40, 400], [x, 480]], 3);
  };

  const drawNest = () => {
    filled(WOOD, () => ctx.roundRect(690, 52, 220, 34, 8));
    line([[690, 8], [910, 8]], 5);
    for (let x = 700; x <= 900; x += 50) line([[x, 8], [x, 52]], 4);
    line([[800, 8], [800, -60]], 5); // flag pole
    ctx.fillStyle = '#e63946';
    ctx.beginPath();
    ctx.moveTo(800, -60);
    ctx.lineTo(850, -48);
    ctx.lineTo(800, -36);
    ctx.fill();
  };

  const drawCatwalk = () => {
    const p = P.find((q) => q.id === 'catwalk');
    for (let x = p.x0; x <= p.x1; x += 70) line([[x, p.y], [x, p.y - 40]], 4);
    line([[p.x0, p.y - 40], [p.x1, p.y - 40]], 4);
    filled(WOOD, () => ctx.rect(p.x0, p.y, p.x1 - p.x0, 10));
  };

  const drawGondola = () => {
    filled('#5a3b26', gondolaPath);
    ctx.save();
    ctx.beginPath();
    gondolaPath();
    ctx.clip();
    for (const r of L.rooms) {
      if (r.outside) continue;
      const y = P[r.d].y;
      ctx.fillStyle = r.color;
      ctx.fillRect(r.x0 + 3, y - 148, r.x1 - r.x0 - 6, 148);
      // Header beam above each doorway between rooms.
      ctx.fillStyle = WOOD_DARK;
      ctx.fillRect(r.x0 - 4, y - 148, 8, 34);
    }
    // Floors.
    for (const id of ['main', 'lower']) {
      const p = P.find((q) => q.id === id);
      ctx.fillStyle = WOOD_DARK;
      ctx.fillRect(p.x0 - 20, p.y, p.x1 - p.x0 + 40, 12);
    }
    ctx.restore();
    ink();
    ctx.beginPath();
    gondolaPath();
    ctx.stroke();
    // Bridge windows.
    for (const x of [1150, 1250, 1350]) {
      filled('#9fd3e6', () => ctx.roundRect(x, 500, 80, 56, 10));
      line([[x + 18, 512], [x + 40, 540]], 3, '#ffffff');
    }
    // Portholes along the lower deck.
    for (const x of [310, 560, 1010, 1260]) filled('#9fd3e6', () => ctx.arc(x, 690, 16, 0, 7));
  };

  const drawOutriggers = (time) => {
    for (const r of L.rooms.filter((q) => q.outside)) {
      const y = P[r.d].y;
      const inner = r.x0 < 800 ? r.x1 : r.x0;
      // Struts back to the hull.
      line([[r.x0 < 800 ? r.x0 + 20 : r.x1 - 20, y + 10], [inner, y + 40]], 6);
      for (let x = r.x0; x <= r.x1; x += 58) line([[x, y], [x, y - 40]], 4);
      line([[r.x0, y - 40], [r.x1, y - 40]], 4);
      filled(WOOD, () => ctx.rect(r.x0, y, r.x1 - r.x0, 10));
    }
    for (const e of L.engines) {
      const y = P[e.d].y + 38;
      const out = e.x < 800 ? -1 : 1;
      filled('#6d7378', () => ctx.ellipse(e.x, y, 62, 24, 0, 0, 7));
      filled(IRON, () => ctx.arc(e.x + out * 62, y, 9, 0, 7));
      // Spinning propeller seen edge-on.
      const spin = Math.cos(time * 30) * 46;
      filled('#3b2a1d', () => ctx.ellipse(e.x + out * 70, y, 6, Math.abs(spin) + 4, 0, 0, 7));
    }
  };

  const drawPod = () => {
    filled('#5a3b26', () => ctx.ellipse(795, 880, 72, 58, 0, 0, 7));
    filled('#9fd3e6', () => ctx.arc(830, 880, 22, 0, 7));
    ctx.fillStyle = WOOD_DARK;
    ctx.fillRect(735, P.find((q) => q.id === 'pod').y, 120, 8);
  };

  // ---- Fittings ----
  const drawPipes = () => {
    for (const pipe of L.pipes) {
      line(pipe.points, 13, INK);
      line(pipe.points, 7, '#9aa1a6');
      const [vx, vy] = pipe.valve;
      const m = moduleFor(pipe.to + ' Pipe');
      ink();
      ctx.lineWidth = 3;
      ctx.fillStyle = !m || m.open ? '#2e9e4f' : '#c0392b'; // green = open, red = closed
      ctx.beginPath();
      ctx.arc(vx, vy, 14, 0, 7);
      ctx.fill();
      ctx.stroke();
      line([[vx - 14, vy], [vx + 14, vy]], 3);
      line([[vx, vy - 14], [vx, vy + 14]], 3);
    }
  };

  const drawRacks = () => {
    for (const r of L.racks) {
      const y = P[r.d].y - 115;
      filled(WOOD, () => ctx.roundRect(r.x - 34, y, 68, 70, 6));
      for (const dx of [-14, 14]) {
        if (r.kind === 'sword') {
          line([[r.x + dx, y + 8], [r.x + dx, y + 58]], 5, '#d8dde0');
          line([[r.x + dx - 9, y + 48], [r.x + dx + 9, y + 48]], 4, INK);
        } else {
          line([[r.x + dx, y + 20], [r.x + dx, y + 62]], 5, '#7a4a24');
          filled(IRON, () => ctx.rect(r.x + dx - 10, y + 8, 20, 14));
        }
      }
    }
  };

  const drawExtinguishers = () => {
    for (const e of L.extinguishers) {
      const y = P[e.d].y - 80;
      filled('#d62828', () => ctx.roundRect(e.x - 10, y, 20, 44, 8));
      line([[e.x, y], [e.x + 10, y - 10]], 4);
    }
  };

  const drawConnectors = () => {
    L.connectors.forEach((c, i) => {
      const yTop = P[c.top].y;
      const yBot = P[c.bottom].y;
      if (c.type === 'ladder' || c.type === 'rope') {
        const color = c.type === 'rope' ? '#a87b4f' : INK;
        const top = c.type === 'rope' ? yTop : yTop - 40;
        line([[c.xTop - 14, top], [c.xTop - 14, yBot]], 4, color);
        line([[c.xTop + 14, top], [c.xTop + 14, yBot]], 4, color);
        for (let y = top + 18; y < yBot; y += 26) line([[c.xTop - 14, y], [c.xTop + 14, y]], 4, color);
      } else if (c.type === 'stairs') {
        line([[c.xTop - 10, yTop], [c.xBottom - 10, yBot]], 6);
        const steps = 7;
        for (let k = 1; k <= steps; k++) {
          const t = k / steps;
          const x = c.xTop + (c.xBottom - c.xTop) * t;
          const y = yTop + (yBot - yTop) * t;
          line([[x - 26, y], [x + 6, y]], 5);
        }
        line([[c.xTop + 20, yTop - 50], [c.xBottom + 20, yBot - 50]], 4); // handrail
      } else if (c.type === 'lift') {
        // Shaft rails and a cage that follows whoever is riding it.
        line([[c.xTop - 40, yTop - 150], [c.xTop - 40, yBot]], 4);
        line([[c.xTop + 40, yTop - 150], [c.xTop + 40, yBot]], 4);
        const rider = [...Object.values(state.players), ...state.boarders].find((w) => w.conn === i);
        if (rider) liftY = rider.y;
        line([[c.xTop, yTop - 150], [c.xTop, liftY - 128]], 3);
        ink();
        ctx.lineWidth = 4;
        ctx.strokeRect(c.xTop - 38, liftY - 128, 76, 128);
        ctx.fillStyle = IRON;
        ctx.fillRect(c.xTop - 38, liftY - 4, 76, 10);
      }
    });
  };

  const drawProps = (time) => {
    // Boiler with glowing firebox and pressure gauge.
    const boiler = L.stations.find((s) => s.n === 'Boiler');
    const by = P[boiler.d].y;
    filled('#3d3d3d', () => ctx.roundRect(boiler.x - 70, by - 112, 90, 112, 16));
    const glow = 0.5 + 0.5 * Math.sin(time * 6);
    const fuel = Math.min(1, (state.ship.fuel || 0) / 40);
    ctx.fillStyle = fuel > 0 ? `rgba(255,${120 + glow * 80},40,${0.3 + 0.7 * fuel})` : '#2b2b2b';
    ctx.fillRect(boiler.x - 50, by - 48, 50, 30);
    const gx = boiler.x + 60;
    const gy = by - 90;
    const angle = -Math.PI * 1.15 + (state.ship.press / 100) * Math.PI * 1.3;
    filled('#f1e2b8', () => ctx.arc(gx, gy, 28, 0, 7));
    line([[gx, gy], [gx + Math.cos(angle) * 22, gy + Math.sin(angle) * 22]], 5, state.ship.press < config.BOILER.WARN_AT ? '#2e7d32' : '#c62828');

    // Ship's wheel at the helm, turning with speed.
    const helm = L.stations.find((s) => s.n === 'Helm');
    const hy = P[helm.d].y - 70;
    ctx.save();
    ctx.translate(helm.x + 30, hy);
    ctx.rotate(state.ship.speed * 6);
    ink();
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, 7);
    ctx.stroke();
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      line([[0, 0], [Math.cos(a) * 38, Math.sin(a) * 38]], 4, WOOD);
    }
    ctx.restore();

    // Chart table for the navigator.
    const nav = L.stations.find((s) => s.n === 'Navigator');
    filled('#e9dcb5', () => ctx.rect(nav.x - 40, P[nav.d].y - 52, 80, 12));
    line([[nav.x - 30, P[nav.d].y - 40], [nav.x - 30, P[nav.d].y]], 5);
    line([[nav.x + 30, P[nav.d].y - 40], [nav.x + 30, P[nav.d].y]], 5);

    // Ammo crates in the hold.
    const hold = L.stations.find((s) => s.n === 'Ammo Hold');
    const hy2 = P[hold.d].y;
    [[30, 0], [64, 0], [47, -26]].forEach(([x, y]) => filled('#b5833f', () => ctx.rect(hold.x + x, hy2 - 24 + y, 34, 24)));
  };

  const moduleFor = (name) => (state.modules || []).find((m) => m.name === name);

  // Health bars on damaged modules, smoke on broken ones, steam jets from burst pipes.
  const drawModuleStatus = (time) => {
    for (const m of state.modules || []) {
      const { x, y } = m.pos;
      if (m.broken) {
        const leaking = m.kind === 'pipe' && m.open;
        for (let k = 0; k < 3; k++) {
          const t = (time * 0.8 + k / 3) % 1;
          ctx.fillStyle = leaking ? `rgba(255,255,255,${0.8 - t * 0.8})` : `rgba(60,60,60,${0.7 - t * 0.7})`;
          ctx.beginPath();
          ctx.arc(x + Math.sin(time * 3 + k) * 10 + (leaking ? t * 40 : 0), y - 20 - t * 70, 10 + t * 18, 0, 7);
          ctx.fill();
        }
        ctx.font = '900 22px Georgia';
        ctx.textAlign = 'center';
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#fff';
        ctx.strokeText('BROKEN', x, y - 34);
        ctx.fillStyle = '#c62828';
        ctx.fillText('BROKEN', x, y - 34);
      }
      if (m.hp < m.max) {
        const w = 60;
        ctx.fillStyle = '#3b2a1d';
        ctx.fillRect(x - w / 2, y - 26, w, 9);
        ctx.fillStyle = m.hp > 50 ? '#8fe388' : m.hp > 0 ? '#f4a261' : '#c62828';
        ctx.fillRect(x - w / 2, y - 26, (w * m.hp) / m.max, 9);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - w / 2, y - 26, w, 9);
      }
    }
  };

  // Gasbag holes: torn patches with gas wisping out.
  const drawGasHoles = (time) => {
    for (const h of state.gasHoles || []) {
      ink();
      ctx.lineWidth = 3;
      ctx.fillStyle = '#3b2a1d';
      ctx.beginPath();
      ctx.moveTo(h.x - 16, h.y - 8);
      ctx.lineTo(h.x - 4, h.y - 14);
      ctx.lineTo(h.x + 14, h.y - 6);
      ctx.lineTo(h.x + 10, h.y + 10);
      ctx.lineTo(h.x - 12, h.y + 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      for (let k = 0; k < 3; k++) {
        const t = (time * 1.2 + k / 3) % 1;
        ctx.fillStyle = `rgba(225,240,220,${0.8 - t * 0.8})`;
        ctx.beginPath();
        ctx.arc(h.x + Math.sin(time * 4 + k) * 8, h.y - 14 - t * 50, 7 + t * 14, 0, 7);
        ctx.fill();
      }
      if (h.prog > 0) {
        ctx.fillStyle = '#3b2a1d';
        ctx.fillRect(h.x - 24, h.y + 16, 48, 8);
        ctx.fillStyle = '#8fe388';
        ctx.fillRect(h.x - 24, h.y + 16, 48 * Math.min(1, h.prog), 8);
      }
    }
  };

  // Steam vent stacks: they hiss when pressure is high.
  const drawVents = (time) => {
    const high = state.ship.press >= config.BOILER.WARN_AT;
    for (const v of L.vents) {
      const y = P[v.d].y;
      filled('#9aa1a6', () => ctx.rect(v.x - 9, y - 140, 18, 100));
      filled('#6d7378', () => ctx.rect(v.x - 16, y - 150, 32, 14));
      filled(high ? '#e63946' : '#c0392b', () => ctx.arc(v.x, y - 60, 13, 0, 7));
      line([[v.x - 13, y - 60], [v.x + 13, y - 60]], 3);
      if (high) {
        for (let k = 0; k < 2; k++) {
          const t = (time * 1.5 + k / 2) % 1;
          ctx.fillStyle = `rgba(255,255,255,${0.7 - t * 0.7})`;
          ctx.beginPath();
          ctx.arc(v.x, y - 160 - t * 40, 8 + t * 12, 0, 7);
          ctx.fill();
        }
      }
    }
  };

  // Coal bunker: a bin with a coal heap.
  const drawCoal = () => {
    const s = L.stations.find((q) => q.n === 'Coal Bunker');
    if (!s) return;
    const y = P[s.d].y;
    filled(WOOD, () => ctx.rect(s.x - 50, y - 46, 100, 46));
    filled('#2b2b2b', () => {
      ctx.moveTo(s.x - 44, y - 44);
      ctx.quadraticCurveTo(s.x - 10, y - 86, s.x + 44, y - 44);
      ctx.closePath();
    });
  };

  const drawLabels = () => {
    ctx.font = '700 24px Georgia';
    ctx.textAlign = 'center';
    const placed = [];
    for (const s of [...L.stations].sort((a, b) => a.x - b.x)) {
      const y = P[s.d].y;
      ctx.fillStyle = 'rgba(27,20,16,.2)';
      rrect(s.x - 50, y - 6, 100, 8, 4);
      ctx.fill();
      const w = ctx.measureText(s.n).width + 20;
      const id = P[s.d].id;
      let ly = id === 'nest' ? y - 100 : id === 'pod' ? y - 20 : y - 134;
      const lx = id === 'pod' ? s.x + 130 : s.x;
      // Drop a label one row if it would overlap its neighbour.
      while (placed.some((o) => Math.abs(o.ly - ly) < 30 && Math.abs(o.lx - lx) < (o.w + w) / 2 + 6)) ly += 36;
      placed.push({ lx, ly, w });
      ctx.fillStyle = '#f1e2b8';
      ink();
      ctx.lineWidth = 3;
      rrect(lx - w / 2, ly, w, 32, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.fillText(s.n, lx, ly + 24);
    }
  };

  return (time) => {
    drawGasbag();
    drawNest();
    drawGondola();
    drawOutriggers(time);
    drawPod();
    drawPipes();
    drawRacks();
    drawExtinguishers();
    drawProps(time);
    drawCoal();
    drawVents(time);
    drawConnectors();
    drawCatwalk();
    drawLabels();
    drawGasHoles(time);
    drawModuleStatus(time);
  };
}
