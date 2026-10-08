// TV drawing for linked stations (links.js): a thin brass "wire" with a travelling spark between a loader and
// the gunner they are priming for, a LOOKOUT <-> HELM wire (plus gust/updraft warning arrows ahead of the ship),
// and the gold SURGE ring on whatever the boiler is feeding. A handful of strokes each, nothing else.
import { config } from '../../config.js';
import { mainShip } from './ships.js';

const INK = '#1b1410';
const BRASS = '#d9a441';
const GOLD = '#ffd23f';

export function createLinkArt({ ctx, state }) {
  const layout = mainShip(state).layout; // (this ship's own layout)
  const PLATFORMS = layout.platforms;
  const outlined = (text, x, y, color, font) => {
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  };

  // An ink-edged brass wire from a to b (ship coordinates) sagging a little, with a spark running along it and a soft glow.
  const wire = (a, b, time, sag, strong) => {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 + sag;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(mx, my, b.x, b.y);
    ctx.strokeStyle = INK;
    ctx.lineWidth = strong ? 8 : 6;
    ctx.stroke();
    ctx.strokeStyle = BRASS;
    ctx.lineWidth = strong ? 4 : 3;
    ctx.stroke();
    // the spark: a point running along the curve and a glow where it is
    const t = (time * 1.6) % 1;
    const u = 1 - t;
    const sx = u * u * a.x + 2 * u * t * mx + t * t * b.x;
    const sy = u * u * a.y + 2 * u * t * my + t * t * b.y;
    ctx.fillStyle = `rgba(255,226,140,${strong ? 0.5 : 0.38})`;
    ctx.beginPath();
    ctx.arc(sx, sy, strong ? 17 : 12, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#fff6c9';
    ctx.beginPath();
    ctx.arc(sx, sy, strong ? 5 : 4, 0, 7);
    ctx.fill();
    ctx.restore();
  };

  const chest = (p) => ({ x: p.x, y: p.y - 70 });

  // Ship space, after the crew are drawn.
  const drawWires = (time) => {
    const L = state.links;
    if (!L) return;
    // Gun + loader: the wire between them while the loader holds Action.
    for (const l of L.loaders) wire(chest(l.loader), chest(l.gunner), time, 14, false);
    // Helm + lookout: a long wire from the crow's nest to the wheel, with the link marker.
    if (L.nest) {
      const players = Object.values(state.players);
      const helm = players.find((q) => layout.kindOf(q.lock) === 'helm');
      const nest = players.find((q) => layout.isNestStation(q.lock));
      if (helm && nest) {
        const a = { x: nest.x, y: nest.y - 80 };
        const b = { x: helm.x, y: helm.y - 80 };
        wire(a, b, time, 40, L.nestSpot);
        outlined('LOOKOUT ↔ HELM' + (L.nestSpot ? '  +' + Math.round(config.LINKS.HELM_SPOT * 100) + '%' : '  +' + Math.round(config.LINKS.HELM_MAN * 100) + '%'), (a.x + b.x) / 2, (a.y + b.y) / 2 + 24, L.nestSpot ? GOLD : '#f0e2b6', '900 22px Georgia');
      }
    }
    // Boiler surge: a gold ring on the consumer being fed.
    const s = L.surge;
    if (s && s.level > 0.02) {
      const spots = s.to === 'coil' ? [{ x: layout.coil.x, y: layout.coil.y }] : layout.engines.map((e) => ({ x: e.x, y: PLATFORMS[e.d].y - 50 }));
      ctx.save();
      for (const e of spots) {
        const r = 52 + Math.sin(time * 14) * 4 + (1 - s.level) * 18;
        ctx.globalAlpha = Math.min(1, s.level * 1.4);
        ctx.lineWidth = 12;
        ctx.strokeStyle = INK;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, 7);
        ctx.stroke();
        ctx.lineWidth = 6;
        ctx.strokeStyle = GOLD;
        ctx.stroke();
        outlined('SURGE', e.x, e.y - r - 12, GOLD, '900 24px Georgia');
      }
      ctx.restore();
    }
  };

  // Screen space (same world -> screen mapping as the SPOTTED marks): storm gusts coming, shown ahead of the ship while the nest is manned.
  const drawGust = (width, height, view, time) => {
    const L = state.links;
    const w = state.weather;
    if (!L || !L.nest || !w || w.storm < 0.15) return;
    const soon = w.gustIn > 0 && w.gustIn <= config.LINKS.GUST_WARN;
    if (!soon && !w.gusting) return;
    const dir = (w.gusting ? w.gust : w.gustNext) > 0 ? -1 : 1; // (gust > 0 lifts the ship = arrows point up the screen)
    const up = dir < 0;
    const sx0 = width / 2 + (1900 - view.cx) * view.zoom;
    const sy0 = height / 2 + (layout.midPoint.y - state.ship.alt - view.cy) * view.zoom;
    const k = Math.max(0.6, view.zoom);
    const color = up ? '#ffd27a' : '#8fc8e8';
    const flash = w.gusting ? 1 : 0.55 + 0.45 * Math.sin(time * 12);
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, flash));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < 3; i++) {
      const x = sx0 + (i - 1) * 90 * k;
      const y = sy0 + dir * (((time * 90 + i * 40) % 120) - 60) * k; // (they drift the way the gust will push)
      ctx.beginPath();
      ctx.moveTo(x - 26 * k, y - dir * 14 * k);
      ctx.lineTo(x, y + dir * 14 * k);
      ctx.lineTo(x + 26 * k, y - dir * 14 * k);
      for (const [wd, c] of [[11, INK], [6, color]]) {
        ctx.lineWidth = wd * k;
        ctx.strokeStyle = c;
        ctx.stroke();
      }
    }
    outlined(w.gusting ? (up ? 'UPDRAFT!' : 'DOWNDRAFT!') : up ? 'UPDRAFT COMING' : 'DOWNDRAFT COMING', sx0, sy0 - 100 * k, color, `900 ${Math.round(20 * k)}px Georgia`);
    ctx.restore();
  };

  return { drawWires, drawGust };
}
