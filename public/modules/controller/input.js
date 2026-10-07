import { config } from '../../config.js';
export function createControllerInput({ network, ui }) {
  const pad = document.getElementById('pad');
  const knob = document.getElementById('knob');
  const actButton = document.getElementById('act');
  const atkButton = document.getElementById('atk');
  const jumpButton = document.getElementById('jump');

  let jx = 0;
  let jy = 0;
  let dirty = false;
  let pointerId = null;
  let firing = false;
  let attackTimer = null;

  const move = (event) => {
    const rect = pad.getBoundingClientRect();
    const radius = rect.width / 2;
    let dx = event.clientX - (rect.left + radius);
    let dy = event.clientY - (rect.top + radius);
    const magnitude = Math.hypot(dx, dy);
    if (magnitude > radius) {
      dx *= radius / magnitude;
      dy *= radius / magnitude;
    }
    jx = dx / radius;
    jy = dy / radius;
    dirty = true;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const end = (event) => {
    if (event.pointerId === pointerId) {
      pointerId = null;
      jx = 0;
      jy = 0;
      dirty = true;
      knob.style.transform = '';
    }
  };

  pad.addEventListener('pointerdown', (event) => {
    pointerId = event.pointerId;
    pad.setPointerCapture(pointerId);
    move(event);
  });
  pad.addEventListener('pointermove', (event) => {
    if (event.pointerId === pointerId) move(event);
  });
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);

  // Buttons react on touch-down, show a pressed state and buzz briefly.
  const pressable = (button, onDown, onUp) => {
    button.addEventListener('pointerdown', (event) => {
      try {
        button.setPointerCapture(event.pointerId);
      } catch {}
      button.classList.add('down');
      onDown();
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((name) =>
      button.addEventListener(name, () => {
        if (!button.classList.contains('down')) return;
        button.classList.remove('down');
        onUp();
      }),
    );
  };

  // Helm throttle lever: up = ahead (full speed at the top), the STOP line = hover, below it =
  // reverse. throttle runs from -REVERSE to 1.
  const REV = config.SHIP.REVERSE;
  const lever = document.getElementById('lever');
  const leverFill = lever.querySelector('.fill');
  const leverHandle = lever.querySelector('.handle');
  const leverStop = lever.querySelector('.stop');
  let throttle = 0.5;
  let lastThrottleSend = 0;
  const toPos = (thr) => (thr + REV) / (1 + REV); // 0 = bottom, 1 = top
  const showLever = () => {
    const stop = toPos(0);
    const pos = toPos(throttle);
    leverStop.style.bottom = stop * 100 + '%';
    leverFill.style.bottom = Math.min(stop, pos) * 100 + '%';
    leverFill.style.height = Math.abs(pos - stop) * 100 + '%';
    leverFill.style.background = throttle < 0 ? '#e63946' : '#4caf50';
    leverHandle.style.top = (1 - pos) * 100 + '%';
  };
  const dragLever = (event) => {
    const rect = lever.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));
    throttle = pos * (1 + REV) - REV;
    if (Math.abs(throttle) < 0.06) throttle = 0; // easy to find the hover point
    showLever();
    const now = performance.now();
    if (now - lastThrottleSend > 80) {
      lastThrottleSend = now;
      network.sendInput({ jx, jy, thr: throttle });
    }
  };
  let leverPointer = null;
  lever.addEventListener('pointerdown', (event) => {
    leverPointer = event.pointerId;
    try {
      lever.setPointerCapture(event.pointerId);
    } catch {}
    dragLever(event);
  });
  lever.addEventListener('pointermove', (event) => {
    if (event.pointerId === leverPointer) dragLever(event);
  });
  const leverUp = (event) => {
    if (event.pointerId !== leverPointer) return;
    leverPointer = null;
    network.sendInput({ jx, jy, thr: throttle }); // final position always arrives
  };
  lever.addEventListener('pointerup', leverUp);
  lever.addEventListener('pointercancel', leverUp);
  showLever();

  // Helm PRESSURE lever (the gasbag): up = pump hot steam in (she rises), the middle line = hold,
  // down = vent (she drops). Stays where you leave it. gas runs from -1 to 1.
  const plever = document.getElementById('plever');
  const pFill = plever.querySelector('.fill');
  const pHandle = plever.querySelector('.handle');
  let gas = 0;
  let lastGasSend = 0;
  const showPLever = () => {
    const pos = (gas + 1) / 2;
    pFill.style.bottom = Math.min(0.5, pos) * 100 + '%';
    pFill.style.height = Math.abs(pos - 0.5) * 100 + '%';
    pFill.style.background = gas < 0 ? '#3a86ff' : '#ff8c42';
    pHandle.style.top = (1 - pos) * 100 + '%';
  };
  const dragPLever = (event) => {
    const rect = plever.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));
    gas = pos * 2 - 1;
    if (Math.abs(gas) < 0.12) gas = 0; // easy to find hold
    showPLever();
    const now = performance.now();
    if (now - lastGasSend > 80) {
      lastGasSend = now;
      network.sendInput({ jx, jy, gas });
    }
  };
  let pPointer = null;
  plever.addEventListener('pointerdown', (event) => {
    pPointer = event.pointerId;
    try {
      plever.setPointerCapture(event.pointerId);
    } catch {}
    dragPLever(event);
  });
  plever.addEventListener('pointermove', (event) => {
    if (event.pointerId === pPointer) dragPLever(event);
  });
  const pUp = (event) => {
    if (event.pointerId !== pPointer) return;
    pPointer = null;
    network.sendInput({ jx, jy, gas });
  };
  plever.addEventListener('pointerup', pUp);
  plever.addEventListener('pointercancel', pUp);
  showPLever();

  const sendAction = () => network.sendInput({ jx, jy, act: 1 });

  const cease = () => {
    if (firing) {
      firing = false;
      network.sendInput({ jx, jy, fire: 0 });
    }
  };

  // Action: tap does it; for hold actions (patch, repair, fire...) keep "fire" on while held.
  pressable(
    actButton,
    () => {
      sendAction();
      if ((ui.getState ? ui.getState() : {}).hold) {
        firing = true;
        network.sendInput({ jx, jy, fire: 1 });
      }
    },
    cease,
  );

  // Attack: one swing per tap; holding keeps swinging. On a gun this button is PRIME: hold it to charge the shell.
  const swing = () => network.sendInput({ jx, jy, atk: 1 });
  let priming = false;
  pressable(
    atkButton,
    () => {
      if ((ui.getState ? ui.getState() : {}).attack === 'Prime') {
        priming = true;
        network.sendInput({ jx, jy, prime: 1 });
        return;
      }
      swing();
      attackTimer = setInterval(swing, 300);
    },
    () => {
      clearInterval(attackTimer);
      if (priming) {
        priming = false;
        network.sendInput({ jx, jy, prime: 0 });
      }
    },
  );

  // HELP!: calls the nearest idle crew over (the host has its own cooldown; this just shows it).
  const helpButton = document.getElementById('help');
  let helpUntil = 0;
  const showHelp = () => {
    const left = Math.ceil((helpUntil - performance.now()) / 1000);
    helpButton.classList.toggle('wait', left > 0);
    helpButton.textContent = left > 0 ? '🆘 ' + left : '🆘 Help!';
    if (left > 0) setTimeout(showHelp, 250);
  };
  pressable(
    helpButton,
    () => {
      if (performance.now() < helpUntil) return;
      network.sendInput({ jx, jy, help: 1 });
      helpUntil = performance.now() + config.HELP.COOLDOWN * 1000;
      showHelp();
    },
    () => {},
  );

  // Radar: tap a blip to spot it (a big, forgiving tap area; the stick keeps its value).
  document.getElementById('radar').addEventListener('pointerdown', (event) => {
    const hit = ui.radarPick ? ui.radarPick(event.clientX, event.clientY) : null;
    if (hit) network.sendInput({ jx, jy, spot: hit.i, sq: hit.s });
  });

  // Jump: one hop per tap.
  pressable(jumpButton, () => network.sendInput({ jx, jy, jump: 1 }), () => {});

  addEventListener('contextmenu', (event) => event.preventDefault());

  setInterval(() => {
    if (dirty) {
      network.sendInput({ jx, jy });
      dirty = false;
    }
  }, 40);

  return { sendAction, cease };
}
