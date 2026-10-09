// THE CARGO DROP HATCH, painted (hatch.js): a pair of storybook trapdoors in a deck. Closed they lie flat across the floor, two hazard-striped leaves with iron hinges and ring handles; open, the leaves
// swing down from their hinges and hang beside a dark hole. A klaxon lamp flashes at each end while the doors are about to give way, and a red-handled lever stands beside them.
// One drawing for the ship (shipArt.js liveHatches), the tray of the build page (partArt.js) and the blueprint's ghost; ctx is any 2D context, everything is in ship pixels.
//   drawHatch(g, { x0, x1, y, door (0 shut .. 1 wide), warn (0 none .. 1 just pulled), handle (0 .. 1), lx, time, crewOn, lever (draw it, default true) })
import { config } from '../../config.js';

const INK = () => config.INK;
const WOOD = '#b98a5a', WOOD_DARK = '#6b4a32', IRON = '#6a6568', BRASS = '#c9a85a', RED = '#a8443f', HAZ = '#e8b830', HAZ_K = '#2b2622', HOLE = '#1a1517';

// Diagonal hazard stripes in a box.
function stripes(g, x, y, w, h, phase = 0) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = HAZ; g.fillRect(x, y, w, h);
  g.fillStyle = HAZ_K;
  for (let sx = x - h + phase; sx < x + w; sx += 13) { g.beginPath(); g.moveTo(sx, y + h); g.lineTo(sx + 6.5, y + h); g.lineTo(sx + 6.5 + h, y); g.lineTo(sx + h, y); g.closePath(); g.fill(); }
  g.restore();
}

// One leaf in its own frame: hinge at the origin, lying along +x, thick `th`.
function leaf(g, L, th) {
  g.fillStyle = WOOD; g.strokeStyle = INK(); g.lineWidth = 2.6;
  g.beginPath(); g.rect(0, -th, L, th); g.fill(); g.stroke();
  stripes(g, 3, -th + 2.5, L - 6, th - 5);
  g.strokeStyle = INK(); g.lineWidth = 1.6; g.strokeRect(3, -th + 2.5, L - 6, th - 5);
  g.strokeStyle = WOOD_DARK; g.lineWidth = 1.4; // plank seams
  for (const f of [0.34, 0.68]) { g.beginPath(); g.moveTo(L * f, -th + 1); g.lineTo(L * f, -1); g.stroke(); }
  g.fillStyle = IRON; g.strokeStyle = INK(); g.lineWidth = 1.8; // the hinge strap and its bolt, and the ring handle at the free end
  g.beginPath(); g.rect(0, -th - 1, 15, 4); g.fill(); g.stroke();
  g.beginPath(); g.arc(L - 9, -th / 2, 2.6, 0, 7); g.fillStyle = BRASS; g.fill(); g.stroke();
}

export function drawHatch(g, o) {
  const { x0, x1, y } = o, w = x1 - x0, open = Math.max(0, Math.min(1, o.door || 0)), th = 11, time = o.time || 0;
  g.save();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // the hole: dark, with a faint glow of light from below, once the doors are swinging
  if (open > 0.02) {
    const hh = 19 * Math.min(1, open * 3);
    const gr = g.createLinearGradient(0, y - 2, 0, y + hh);
    gr.addColorStop(0, '#2c2326'); gr.addColorStop(1, HOLE);
    g.fillStyle = gr; g.fillRect(x0, y - 2, w, hh + 2);
    g.strokeStyle = INK(); g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(x0, y - 2); g.lineTo(x0, y + hh); g.moveTo(x1, y - 2); g.lineTo(x1, y + hh); g.stroke();
  }
  // the frame: an iron lip along each end of the hole
  g.fillStyle = IRON; g.strokeStyle = INK(); g.lineWidth = 2.2;
  for (const ex of [x0 - 6, x1 - 2]) { g.beginPath(); g.rect(ex, y - 5, 8, 7); g.fill(); g.stroke(); }
  // the two leaves, hinged at the ends, swinging down as the doors open
  const ang = open * 1.45;
  for (const side of [-1, 1]) {
    g.save();
    g.translate(side < 0 ? x0 : x1, y + 3);
    g.scale(side < 0 ? 1 : -1, 1);
    g.rotate(ang);
    leaf(g, w / 2 - (open > 0.02 ? 1 : 0), th);
    g.restore();
  }
  if (open < 0.02) { // shut: the seam where the leaves meet, and a hasp across it
    g.strokeStyle = INK(); g.lineWidth = 2;
    g.beginPath(); g.moveTo((x0 + x1) / 2, y - th + 2); g.lineTo((x0 + x1) / 2, y + 2); g.stroke();
  }
  // the klaxon: an amber lamp at each end flashing while the doors are about to give way, a red wash over the stripes, and the shout when somebody stands on them
  if (o.warn > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 15);
    for (const lx of [x0 - 16, x1 + 16]) {
      g.strokeStyle = INK(); g.lineWidth = 2.2;
      g.fillStyle = IRON; g.beginPath(); g.rect(lx - 5, y - 14, 10, 14); g.fill(); g.stroke();
      g.fillStyle = `rgba(255,${150 + Math.round(60 * pulse)},40,${0.55 + 0.45 * pulse})`; g.beginPath(); g.arc(lx, y - 24, 9, 0, 7); g.fill(); g.stroke();
      g.fillStyle = `rgba(255,190,60,${0.18 * pulse})`; g.beginPath(); g.arc(lx, y - 24, 30, 0, 7); g.fill();
    }
    g.fillStyle = `rgba(200,40,36,${0.12 + 0.22 * pulse})`; g.fillRect(x0, y - th - 1, w, th + 6);
    if (o.crewOn && pulse > 0.25) {
      g.font = '700 30px ' + config.FONTS.TEXT;
      g.textAlign = 'center';
      g.lineWidth = 6; g.strokeStyle = '#fff'; g.strokeText('CLEAR THE HATCH!', (x0 + x1) / 2, y - 62);
      g.fillStyle = '#c0282f'; g.fillText('CLEAR THE HATCH!', (x0 + x1) / 2, y - 62);
    }
  }
  if (o.lever !== false && o.lx != null) drawLever(g, o.lx, y, o.handle || 0);
  g.restore();
}

// The lever: an iron plate and post with a red-handled arm, back when the hatch is shut, pulled forward when it is open.
export function drawLever(g, x, y, handle) {
  g.save();
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.fillStyle = IRON; g.strokeStyle = INK(); g.lineWidth = 2.4;
  g.beginPath(); g.rect(x - 15, y - 7, 30, 7); g.fill(); g.stroke();
  g.fillStyle = WOOD_DARK; g.beginPath(); g.rect(x - 5, y - 36, 10, 30); g.fill(); g.stroke();
  stripes(g, x - 4, y - 24, 8, 10);
  const a = -0.8 + handle * 1.6, px = x, py = y - 33, hx = px + Math.sin(a) * 38, hy = py - Math.cos(a) * 38;
  g.strokeStyle = INK(); g.lineWidth = 7; g.beginPath(); g.moveTo(px, py); g.lineTo(hx, hy); g.stroke();
  g.strokeStyle = BRASS; g.lineWidth = 3.4; g.beginPath(); g.moveTo(px, py); g.lineTo(hx, hy); g.stroke();
  g.fillStyle = RED; g.strokeStyle = INK(); g.lineWidth = 2.4; g.beginPath(); g.arc(hx, hy, 8, 0, 7); g.fill(); g.stroke();
  g.fillStyle = BRASS; g.beginPath(); g.arc(px, py, 4.5, 0, 7); g.fill(); g.stroke();
  g.restore();
}

export { stripes as hazardStripes };
