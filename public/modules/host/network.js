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
      x: SHIP_LAYOUT.boarderEntryPoints[0].x + Math.random() * (SHIP_LAYOUT.boarderEntryPoints[1].x - SHIP_LAYOUT.boarderEntryPoints[0].x),
      y: -60,
      fall: true,
      jx: 0,
      jy: 0,
      station: null,
    });
    Object.assign(player, m, { connected: true, uk: null }); // uk: null = resend button labels to the phone
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
      if (data.atk) player.atkQ = true;
      if ('thr' in data) player.thr = data.thr;
      if (data.perfect) player.perfect = true;
      if ('vote' in data) player.vote = data.vote;
      if (data.leave) player.leaveQ = true;
      if ('fire' in data) player.fire = !!data.fire;
    }
  });

  socket.on('room:closed', () => {
    if (onRoomClosed) onRoomClosed();
    else location.reload();
  });

  // CAST OFF starts the flight (also Space / Enter on the TV keyboard).
  const castButton = document.getElementById('castoff');
  const showCastButton = () => {
    castButton.style.display = simulation.state.phase === 'lobby' ? '' : 'none';
    document.getElementById('join').classList.toggle('flying', simulation.state.phase !== 'lobby');
  };
  const castOff = () => {
    simulation.castOff();
    showCastButton();
  };
  castButton.onclick = castOff;
  addEventListener('keydown', (e) => (e.key === ' ' || e.key === 'Enter') && castOff());
  // Back at the mast after the ship is lost: the button comes back.
  setInterval(showCastButton, 250);

  // Difficulty button cycles Easy -> Normal -> Hard.
  const diffButton = document.getElementById('difficulty');
  const showDifficulty = () => (diffButton.textContent = 'Difficulty: ' + config.DIFFICULTY[simulation.state.difficulty].label);
  diffButton.onclick = () => {
    const keys = Object.keys(config.DIFFICULTY);
    simulation.state.difficulty = keys[(keys.indexOf(simulation.state.difficulty) + 1) % keys.length];
    showDifficulty();
  };
  showDifficulty();

  document.getElementById('bots').onclick = () => {
    const speciesNames = config.CREW_SPECIES;
    const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
    for (let i = 0; i < 4 && Object.keys(simulation.state.players).length < config.MAX_PLAYERS; i++) {
      const id = 'bot' + Math.random();
      simulation.state.players[id] = {
        id,
        bot: true,
        name: 'Bot' + (Object.keys(simulation.state.players).length + 1),
        species: speciesNames[Math.random() * speciesNames.length | 0],
        color: colors[Math.random() * colors.length | 0],
        x: SHIP_LAYOUT.boarderEntryPoints[0].x + Math.random() * (SHIP_LAYOUT.boarderEntryPoints[1].x - SHIP_LAYOUT.boarderEntryPoints[0].x),
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
