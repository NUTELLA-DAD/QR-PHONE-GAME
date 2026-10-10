// Dev page for the giant creatures (public/creaturetest.html): a Kraken puppet rising from a sea line, with a plain outline of the classic ship (2700 px) beside it for scale.
// Click: the nearest free tentacle pulls back, then snaps to the point. Buttons: grab the ship's stern (the tip stays glued while you drag the ship), open the mouth, sever a
// tentacle (click a segment: it and everything outward falls away), toggle lit/dim, reset. Drag pans, the wheel zooms. Uses the real creature.js / kraken.js / creatureArt.js.
import { config } from '../config.js';
import { stepBody, hitInfo, severPart, moveGrip, setLit, makeRng } from './host/creature.js';
import { createKraken, krakenReach, krakenGrab, krakenLetGo, krakenMouth } from './host/creatures/kraken.js';
import { createCreatureArt } from './host/creatureArt.js';

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const hud = document.getElementById('hud');
const btn = (id) => document.getElementById(id);
const art = createCreatureArt({ ctx });
const SEA_Y = 0; // the sea line
const SHIP = { LEN: 2700, STERN: [-1350, 40] }; // the classic ship: length, and the stern point a tentacle grips (relative to her centre)
const GRAVITY = 2600; // px/s^2 for tumbling debris
const rng = makeRng(99); // (the page's own seeded random numbers, for the debris spin)

let body, ship, debris, cam, armed, lit, last, acc;
const view = { w: 1, h: 1, dpr: 1 };

function reset() {
  body = createKraken(0, -500, 7); // the mantle's centre; the limbs' roots then sit just under the sea line
  ship = { x: 2300, y: -1650, grabber: null };
  debris = [];
  armed = false;
  lit = true;
  acc = 0;
  fit();
  sync();
}
function fit() { // the camera zoomed out to take in the whole creature and the ship
  cam = { x: 400, y: -800, zoom: Math.min(view.w / 8600, view.h / 3600) };
}
function resize() {
  view.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  view.w = window.innerWidth;
  view.h = window.innerHeight;
  cv.width = Math.round(view.w * view.dpr);
  cv.height = Math.round(view.h * view.dpr);
}
function sync() { // button looks
  btn('grab').textContent = ship.grabber ? 'Let go' : 'Grab ship';
  btn('grab').classList.toggle('on', !!ship.grabber);
  btn('sever').classList.toggle('on', armed);
}
const toWorld = (mx, my) => [(mx - view.w / 2) / cam.zoom + cam.x, (my - view.h / 2) / cam.zoom + cam.y];
const stern = () => [ship.x + SHIP.STERN[0], ship.y + SHIP.STERN[1]];

// ---- buttons ----
btn('grab').onclick = () => {
  if (ship.grabber) {
    krakenLetGo(body);
    ship.grabber = null;
  } else {
    const [sx, sy] = stern();
    ship.grabber = krakenGrab(body, sx, sy);
  }
  sync();
};
btn('mouth').onclick = () => krakenMouth(body);
btn('sever').onclick = () => { armed = !armed; sync(); };
btn('lit').onclick = () => { lit = !lit; setLit(body, lit); };
btn('reset').onclick = reset;

// ---- mouse: click = reach / sever, drag = pan (or move the ship), wheel = zoom ----
let drag = null;
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId);
  const [wx, wy] = toWorld(e.clientX, e.clientY);
  const onShip = Math.abs(wx - ship.x) < SHIP.LEN / 2 + 100 && Math.abs(wy - ship.y) < 520;
  drag = { x: e.clientX, y: e.clientY, moved: 0, mode: onShip ? 'ship' : 'pan', shift: e.shiftKey };
});
cv.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX;
  drag.y = e.clientY;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  if (drag.moved < 6) return;
  if (drag.mode === 'ship') {
    ship.x += dx / cam.zoom;
    ship.y += dy / cam.zoom;
  } else {
    cam.x -= dx / cam.zoom;
    cam.y -= dy / cam.zoom;
  }
});
cv.addEventListener('pointerup', (e) => {
  const d = drag;
  drag = null;
  if (!d || d.moved >= 6) return;
  const [wx, wy] = toWorld(e.clientX, e.clientY);
  if (armed || d.shift) {
    const hit = hitInfo(body, wx, wy, 40 / cam.zoom);
    if (hit && hit.part.kind === 'tentacle') {
      const p = hit.part;
      const gone = severPart(body, p, hit.seg);
      if (gone.length) {
        const o = gone[0];
        debris.push({ cx: o.x, cy: o.y, a: 0, vx: (rng() - 0.5) * 300, vy: -250, w: (rng() - 0.5) * 2.4, part: { segs: gone.map((s) => ({ ...s, x: s.x - o.x, y: s.y - o.y })), side: p.side, lit: p.lit, hit: 0, severed: false } });
      }
      if (ship.grabber === p) ship.grabber = null;
      armed = false;
      sync();
    }
    return;
  }
  krakenReach(body, wx, wy);
});
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const [wx, wy] = toWorld(e.clientX, e.clientY);
  cam.zoom = Math.max(0.03, Math.min(1.2, cam.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
  cam.x = wx - (e.clientX - view.w / 2) / cam.zoom; // (zoom about the cursor)
  cam.y = wy - (e.clientY - view.h / 2) / cam.zoom;
}, { passive: false });
cv.addEventListener('dblclick', fit);
window.addEventListener('resize', () => { resize(); });

// ---- the ship outline, for scale ----
function drawShip() {
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.strokeStyle = config.INK;
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#ebdfc0'; // gasbag
  ctx.beginPath();
  ctx.ellipse(-60, -330, 1100, 270, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#a87b4f'; // hull
  ctx.beginPath();
  ctx.moveTo(-1350, -40);
  ctx.lineTo(1350, -70);
  ctx.lineTo(1200, 150);
  ctx.lineTo(-1150, 170);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#7a5a3a'; // stern fin and bow ram
  ctx.beginPath();
  ctx.moveTo(-1350, -40);
  ctx.lineTo(-1500, -260);
  ctx.lineTo(-1180, -60);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = config.INK;
  ctx.font = '700 90px Georgia';
  ctx.textAlign = 'center';
  ctx.fillText('classic ship, 2700 px', 0, 100);
  ctx.fillStyle = ship.grabber ? '#d84b3a' : '#f2d36b'; // the stern grip point
  ctx.beginPath();
  ctx.arc(SHIP.STERN[0], SHIP.STERN[1], 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawScene() {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = lit ? '#9fc7d8' : '#1e2a40';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.setTransform(view.dpr * cam.zoom, 0, 0, view.dpr * cam.zoom, view.dpr * (view.w / 2 - cam.x * cam.zoom), view.dpr * (view.h / 2 - cam.y * cam.zoom));
  drawShip();
  art.draw(body, { zoom: cam.zoom, dpr: view.dpr });
  for (const d of debris) {
    ctx.save();
    ctx.translate(d.cx, d.cy);
    ctx.rotate(d.a);
    art.drawLimb(d.part, { zoom: cam.zoom, dpr: view.dpr });
    ctx.restore();
  }
  // the sea, over the roots of the limbs
  const x0 = cam.x - view.w / cam.zoom, x1 = cam.x + view.w / cam.zoom, y1 = cam.y + view.h / cam.zoom;
  ctx.fillStyle = lit ? 'rgba(40,98,120,0.82)' : 'rgba(10,22,40,0.88)';
  ctx.fillRect(x0, SEA_Y, x1 - x0, Math.max(0, y1 - SEA_Y));
  ctx.strokeStyle = config.INK;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(x0, SEA_Y);
  ctx.lineTo(x1, SEA_Y);
  ctx.stroke();
}

// ---- the loop: a fixed 60 Hz sim step, drawn once per frame ----
let frames = 0, fpsT = 0, fps = 0, drawMs = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = last === undefined ? 0 : Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  while (acc >= 1 / 60) {
    acc -= 1 / 60;
    simStep();
  }
  const t0 = performance.now();
  drawScene();
  drawMs += (performance.now() - t0 - drawMs) * 0.1;
  frames++;
  if (now - fpsT >= 500) {
    fps = (frames * 1000) / (now - fpsT);
    frames = 0;
    fpsT = now;
    const modes = body.parts.filter((p) => p.limb).map((p) => (p.dead ? 'x' : p.ctl.mode[0])).join('');
    hud.textContent = `${fps.toFixed(0)} fps   draw ${drawMs.toFixed(2)} ms   ${art.stats.blits} blits  ${art.stats.bakes} bakes   zoom ${cam.zoom.toFixed(3)}   key ${body.key}   limbs ${modes}`;
  }
}

function simStep() { // one 1/60 s step: the grip follows the ship (and the ship is held within the limb's reach), the body steps, debris falls
  if (ship.grabber) {
    const g = ship.grabber;
    if (g.ctl.mode === 'idle' && !g.grip && !g.ctl.cmd) ship.grabber = null; // (it was cut or let go)
    else {
      const root = { x: body.x + g.at[0] * body.f, y: body.y + g.at[1] };
      let [sx, sy] = stern();
      const d = Math.hypot(sx - root.x, sy - root.y), max = g.reach * 0.985;
      if (d > max) { // the ship cannot be dragged farther than the limb reaches
        ship.x += (root.x - sx) * (1 - max / d);
        ship.y += (root.y - sy) * (1 - max / d);
        [sx, sy] = stern();
      }
      if (g.ctl.target) { g.ctl.target.x = sx; g.ctl.target.y = sy; }
      moveGrip(g, sx, sy);
    }
    if (!ship.grabber) sync();
  }
  stepBody(body, 1 / 60);
  for (const d of debris) {
    d.vy += GRAVITY / 60;
    d.cx += d.vx / 60;
    d.cy += d.vy / 60;
    d.a += d.w / 60;
  }
  debris = debris.filter((d) => d.cy < 1500);
}

resize();
reset();
const params = new URLSearchParams(location.search);
if (params.get('auto') === '1') { // ?auto=1&skip=3: start already gripping the ship with the mouth open, after 3 s of play (for screenshots)
  const [sx, sy] = stern();
  ship.grabber = krakenGrab(body, sx, sy);
  krakenReach(body, -1800, -1500);
  krakenMouth(body, 30);
  sync();
}
for (let i = 0; i < Number(params.get('skip') || 0) * 60; i++) simStep();
if (params.get('bench') === '1') { // ?bench=1: draw 300 frames at once on the real canvas and show the time (the browser's own JS cost of drawing; rasterising is on top)
  drawScene();
  const t0 = performance.now();
  for (let i = 0; i < 300; i++) { simStep(); drawScene(); }
  document.title = `bench: 300 frames in ${(performance.now() - t0).toFixed(0)} ms = ${((performance.now() - t0) / 300).toFixed(2)} ms/frame, ${art.stats.blits} blits/frame`; // (shown in the tab title)
}
requestAnimationFrame(frame);
window.creatureTest = { get body() { return body; }, art };
