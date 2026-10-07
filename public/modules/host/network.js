import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { crewAboard, crewHeads } from './crewscale.js';

export function initHostNetwork({ simulation, onRoomClosed, onPlayerInput, onJoinBot }) {
  const socket = io({ transports: ['websocket'] });
  const countNode = document.getElementById('count');

  simulation.setSocket?.(socket);

  const count = () => {
    if (countNode) countNode.textContent = `${crewHeads(simulation.state)} / ${config.MAX_PLAYERS} aboard`;
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
      if (data.jump) player.jumpQ = true;
      if ('thr' in data) player.thr = data.thr;
      if ('gas' in data) player.gas = data.gas;
      if (data.perfect) player.perfect = true;
      if ('vote' in data) player.vote = data.vote;
      if (data.leave) player.leaveQ = true;
      if ('fire' in data) player.fire = !!data.fire;
      if ('prime' in data) player.prime = !!data.prime; // holding the PRIME button on a gun
      if (data.help) player.helpQ = true; // HELP! button
      if ('spot' in data) player.spotQ = { i: data.spot | 0, s: data.sq | 0 }; // tapped a radar ping
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

  // Difficulty button cycles Easy -> Normal -> Veteran -> Hard.
  const diffButton = document.getElementById('difficulty');
  // (small text under the label: the game is also tuned to the number of crew aboard, see config.CREW_SCALE)
  const showDifficulty = () => {
    const n = crewAboard(simulation.state);
    const note = n > 0 && config.CREW_SCALE.ENABLED ? `<br><small style="font-size:12px;opacity:.75">tuned for ${n} crew</small>` : '';
    const html = 'Difficulty: ' + config.DIFFICULTY[simulation.state.difficulty].label + note;
    if (diffButton.innerHTML !== html) diffButton.innerHTML = html;
  };
  setInterval(showDifficulty, 500); // (follows players joining and leaving)
  diffButton.onclick = () => {
    const keys = Object.keys(config.DIFFICULTY);
    simulation.state.difficulty = keys[(keys.indexOf(simulation.state.difficulty) + 1) % keys.length];
    showDifficulty();
  };
  showDifficulty();

  // Session length: QUICK VOYAGE / VOYAGE / EVENING CAMPAIGN (config.VOYAGE.MODES), remembered on this TV.
  const modeButton = document.getElementById('mode');
  const showMode = () => {
    const st = simulation.state;
    const M = config.VOYAGE.MODES[st.mode] || config.VOYAGE.MODES[config.VOYAGE.START_MODE];
    const html = 'Mode: ' + M.label + `<br><small style="font-size:12px;opacity:.75">${M.blurb}, ${M.time}</small>`;
    if (modeButton.innerHTML !== html) modeButton.innerHTML = html;
  };
  modeButton.onclick = () => {
    const keys = Object.keys(config.VOYAGE.MODES);
    simulation.setSession(keys[(keys.indexOf(simulation.state.mode) + 1) % keys.length]);
    showMode();
    showDaily();
  };
  // Daily voyage: the route map comes from today's date, with a name for the day and a best result to beat.
  const dailyButton = document.getElementById('daily');
  const showDaily = () => {
    const st = simulation.state;
    let html = 'Daily voyage: off';
    if (st.daily) {
      const d = simulation.dailyInfo();
      const b = d.best;
      html = 'DAILY: ' + d.name + `<br><small style="font-size:12px;opacity:.75">Today's best: ${b ? (b.victory ? 'VICTORY, ' : b.stops + ' stops, ') + b.salvage + ' salvage' : 'none yet'}</small>`;
    }
    if (dailyButton.innerHTML !== html) dailyButton.innerHTML = html;
  };
  dailyButton.onclick = () => {
    simulation.setSession(null, !simulation.state.daily);
    showDaily();
  };
  setInterval(() => { showMode(); showDaily(); }, 500); // (a finished daily voyage updates today's best)
  showMode();
  showDaily();

  document.getElementById('bots').onclick = () => {
    const speciesNames = config.CREW_SPECIES;
    const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
    for (let i = 0; i < 4 && crewHeads(simulation.state) < config.MAX_PLAYERS; i++) {
      const id = 'bot' + Math.random();
      simulation.state.players[id] = {
        id,
        bot: true,
        name: 'Bot' + (crewHeads(simulation.state) + 1),
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
