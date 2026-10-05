export function createControllerInput({ network, ui }) {
  const pad = document.getElementById('pad');
  const knob = document.getElementById('knob');
  const actButton = document.getElementById('act');

  let jx = 0;
  let jy = 0;
  let dirty = false;
  let pointerId = null;
  let firing = false;

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

  const sendAction = () => {
    network.sendInput({ jx, jy, act: 1 });
    navigator.vibrate?.(15);
  };

  const cease = () => {
    if (firing) {
      firing = false;
      network.sendInput({ jx, jy, fire: 0 });
    }
  };

  actButton.addEventListener('pointerdown', () => {
    sendAction();
    const state = ui.getState ? ui.getState() : {};
    if (state.hold) {
      firing = true;
      network.sendInput({ jx, jy, fire: 1 });
    }
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((eventName) => {
    actButton.addEventListener(eventName, cease);
  });

  addEventListener('contextmenu', (event) => event.preventDefault());

  setInterval(() => {
    if (dirty) {
      network.sendInput({ jx, jy });
      dirty = false;
    }
  }, 40);

  return { sendAction, cease };
}
