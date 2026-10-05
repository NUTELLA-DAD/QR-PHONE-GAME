import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';

export function initHostNetwork({ simulation, onRoomClosed, onPlayerInput, onJoinBot }) {
  const socket = io({ transports: ['websocket'] });
  const countNode = document.getElementById('count');

  simulation.setSocket?.(socket);

  const count = () => {
    if (countNode) countNode.textContent = `${Object.keys(simulation.state.players).length} / ${config.MAX_PLAYERS} aboard`;
  };

  socket.on('connect', () => socket.emit('host:create'));

  socket.on('host:created', async (code) => {
    const { base } = await (await fetch('/api/info')).json();
    const url = `${base}/join/${code}`;
    document.getElementById('code').textContent = code;
    document.getElementById('url').textContent = base;
    document.getElementById('qr').src = '/qr?t=' + encodeURIComponent(url);
  });

  socket.on('player:joined', (m) => {
    const player = simulation.state.players[m.id] || (simulation.state.players[m.id] = {
      x: SHIP_LAYOUT.hull.x0 + Math.random() * (SHIP_LAYOUT.hull.x1 - SHIP_LAYOUT.hull.x0),
      y: -60,
      fall: true,
      jx: 0,
      jy: 0,
      station: null,
    });
    Object.assign(player, m, { connected: true });
    count();
  });

  socket.on('player:left', ({ id }) => {
    if (simulation.state.players[id]) simulation.state.players[id].connected = false;
  });

  socket.on('player:input', ({ id, data }) => {
    const player = simulation.state.players[id];
    if (player) {
      player.jx = data.jx || 0;
      player.jy = data.jy || 0;
      if (data.act) player.actQ = true;
      if (data.leave) player.leaveQ = true;
      if ('fire' in data) player.fire = !!data.fire;
    }
  });

  socket.on('room:closed', () => {
    if (onRoomClosed) onRoomClosed();
    else location.reload();
  });

  document.getElementById('bots').onclick = () => {
    const speciesNames = Object.keys(config.SPECIES);
    const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
    for (let i = 0; i < 4 && Object.keys(simulation.state.players).length < config.MAX_PLAYERS; i++) {
      const id = 'bot' + Math.random();
      simulation.state.players[id] = {
        id,
        bot: true,
        name: 'Bot' + (Object.keys(simulation.state.players).length + 1),
        species: speciesNames[Math.random() * speciesNames.length | 0],
        color: colors[Math.random() * colors.length | 0],
        x: SHIP_LAYOUT.hull.x0 + Math.random() * (SHIP_LAYOUT.hull.x1 - SHIP_LAYOUT.hull.x0),
        y: -60,
        fall: true,
        jx: 0,
        jy: 0,
        t: 0,
      };
    }
    count();
  };

  return { socket, count, onPlayerInput, onJoinBot };
}
