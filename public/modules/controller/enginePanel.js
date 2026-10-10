import { config } from '../../config.js';

// The helm's ENGINE PANEL: a small vertical lever per engine, left to right as the ship sits on the screen (the host sends them in that order, ui.eng), each with an arrow under it for the way
// the engine points. LINKED (the default) the main lever moves them all and they glide by themselves (the host shows the auto-trim too); SPLIT unlinks them so each lever sets its own engine.
// LINK joins them again at the main lever. The throttles live on the ship: the host sends the current ones, a new helmsman inherits them.
//   ui.eng = { s: split, lv: the main lever as the host holds it, l: [[engine index, throttle, arrow angle in degrees on the screen, works], ...] } (null: fewer than two engines)
export function createEnginePanel({ network, stick, getMain, setMain }) {
  const box = document.getElementById('eng');
  const modeButton = document.getElementById('engmode');
  const row = document.getElementById('engrow');
  const REV = config.SHIP.REVERSE;
  const toPos = (v) => (v + REV) / (1 + REV); // 0 = bottom, 1 = top, like the main lever
  let split = false;
  let shown = false;
  let sig = '';
  let vals = []; // the throttle of each engine, by engine index
  const els = new Map(); // engine index -> { el, bar, fill, handle, arrow }
  const drag = new Map(); // engine index -> pointer id (being dragged: the host's echo does not move it)
  let lastSend = 0;

  const send = (extra) => {
    const s = stick();
    network.sendInput({ jx: s.jx, jy: s.jy, ...extra });
  };
  const sendThrs = (force) => {
    const now = performance.now();
    if (!force && now - lastSend < 80) return;
    lastSend = now;
    send({ thrs: vals.slice() });
  };

  const draw = (i) => {
    const e = els.get(i);
    if (!e) return;
    const v = vals[i] ?? 0, stop = toPos(0), pos = toPos(v);
    e.stop.style.bottom = stop * 100 + '%';
    e.fill.style.bottom = Math.min(stop, pos) * 100 + '%';
    e.fill.style.height = Math.abs(pos - stop) * 100 + '%';
    e.fill.style.background = v < 0 ? '#e63946' : '#4caf50';
    e.handle.style.top = (1 - pos) * 100 + '%';
  };

  const build = (list) => {
    row.innerHTML = '';
    els.clear();
    for (const [i, , angle] of list) {
      const el = document.createElement('div');
      el.className = 'el';
      el.innerHTML = '<div class="bar"><div class="fill"></div><div class="stop"></div><div class="handle"></div></div><div class="arrow"><i>&#9654;</i></div>';
      const bar = el.querySelector('.bar');
      el.querySelector('.arrow i').style.transform = `rotate(${angle}deg)`; // (the arrow glyph points right: turned to where the engine pushes, on the screen)
      row.appendChild(el);
      els.set(i, { el, bar, fill: el.querySelector('.fill'), stop: el.querySelector('.stop'), handle: el.querySelector('.handle'), arrow: el.querySelector('.arrow i') });
      const drop = (event) => {
        if (drag.get(i) !== event.pointerId) return;
        drag.delete(i);
        if (split) sendThrs(true);
      };
      const set = (event) => {
        if (!split) return; // (linked: the levers are the main lever's and the trim's to move)
        const rect = bar.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));
        let v = pos * (1 + REV) - REV;
        if (Math.abs(v) < 0.06) v = 0; // easy to find stop
        vals[i] = v;
        draw(i);
        sendThrs(false);
      };
      el.addEventListener('pointerdown', (event) => {
        if (!split) return;
        drag.set(i, event.pointerId);
        try {
          el.setPointerCapture(event.pointerId);
        } catch {}
        set(event);
      });
      el.addEventListener('pointermove', (event) => {
        if (drag.get(i) === event.pointerId) set(event);
      });
      el.addEventListener('pointerup', drop);
      el.addEventListener('pointercancel', drop);
    }
  };

  // SPLIT: the levers become the helm's own; LINK: they all go to the main lever.
  const press = () => {
    if (split) send({ split: false, thr: getMain() });
    else send({ split: true });
    split = !split; // (the host's next ui confirms it)
    paint();
  };
  modeButton.addEventListener('pointerdown', (event) => {
    try {
      modeButton.setPointerCapture(event.pointerId);
    } catch {}
    modeButton.classList.add('down');
    press();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) modeButton.addEventListener(name, () => modeButton.classList.remove('down'));

  const paint = () => {
    box.classList.toggle('split', split);
    document.body.classList.toggle('engsplit', split && shown);
    modeButton.textContent = split ? 'LINK' : 'SPLIT';
    modeButton.classList.toggle('split', split);
  };

  // The host's word on the engines (called with every ui message): eng = null hides the panel.
  const show = (eng) => {
    const was = shown;
    shown = !!eng;
    if (!eng) {
      sig = '';
      paint();
      return;
    }
    const next = eng.l.map((q) => q[0] + ':' + q[2]).join('|');
    if (next !== sig) {
      sig = next;
      build(eng.l);
    }
    split = !!eng.s;
    if (!was && !split) setMain(eng.lv); // (a helmsman taking the wheel finds the main lever where the ship's order is)
    eng.l.forEach(([i, v, , works]) => {
      if (!drag.has(i)) vals[i] = v;
      els.get(i)?.el.classList.toggle('off', !works);
      draw(i);
    });
    paint();
  };

  return { show };
}
