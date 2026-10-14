export function createControllerNetwork() {
  const socket = io({ transports: ['websocket'] });

  // The phone's own id (random, kept in its localStorage): the TV's Ship's Book knows this phone again in a later session and keeps its service record under it (names only; nothing else about the phone).
  const pid = () => {
    try {
      if (!localStorage.airshipPid) localStorage.airshipPid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      return localStorage.airshipPid;
    } catch { return ''; }
  };

  const join = ({ code, name, species }) => {
    const token = localStorage['tok' + code];
    socket.emit('player:join', { code, name, species, token, pid: pid() });
  };

  const sendInput = (payload) => {
    // Joystick-only updates may be dropped when busy (a newer one follows); button presses never are.
    const onlyStick = Object.keys(payload).every((k) => k === 'jx' || k === 'jy');
    (onlyStick ? socket.volatile : socket).emit('player:input', payload);
  };

  return { socket, join, sendInput };
}
