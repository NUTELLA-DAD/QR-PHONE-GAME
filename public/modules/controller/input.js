export function createControllerInput({ network, ui }) {
  const pad = document.getElementById('pad');
  const knob = document.getElementById('knob');
  const actButton = document.getElementById('act');
  const atkButton = document.getElementById('atk');

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
      navigator.vibrate?.(15);
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

  // Attack: one swing per tap; holding keeps swinging.
  const swing = () => network.sendInput({ jx, jy, atk: 1 });
  pressable(
    atkButton,
    () => {
      swing();
      attackTimer = setInterval(swing, 300);
    },
    () => clearInterval(attackTimer),
  );

  addEventListener('contextmenu', (event) => event.preventDefault());

  setInterval(() => {
    if (dirty) {
      network.sendInput({ jx, jy });
      dirty = false;
    }
  }, 40);

  return { sendAction, cease };
}
