export function createControllerNetwork() {
  const socket = io({ transports: ['websocket'] });

  const join = ({ code, name, species }) => {
    const token = localStorage['tok' + code];
    socket.emit('player:join', { code, name, species, token });
  };

  const sendInput = (payload) => {
    // Joystick-only updates may be dropped when busy (a newer one follows); button presses never are.
    const onlyStick = Object.keys(payload).every((k) => k === 'jx' || k === 'jy');
    (onlyStick ? socket.volatile : socket).emit('player:input', payload);
  };

  return { socket, join, sendInput };
}
