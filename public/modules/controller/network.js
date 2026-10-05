export function createControllerNetwork() {
  const socket = io({ transports: ['websocket'] });

  const join = ({ code, name, species }) => {
    const token = localStorage['tok' + code];
    socket.emit('player:join', { code, name, species, token });
  };

  const sendInput = (payload) => {
    socket.volatile.emit('player:input', payload);
  };

  return { socket, join, sendInput };
}
