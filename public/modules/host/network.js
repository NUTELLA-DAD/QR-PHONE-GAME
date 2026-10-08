import { config } from '../../config.js';
import { mainShip, shipOf, crewOf } from './ships.js';
import { crewAboard, crewHeads } from './crewscale.js';

// What a phone's input message does to its player (also used by tools/controls.mjs, which plays a person without a socket).
// Button presses are queued flags the simulation eats next frame; `aid` is the id of the label the phone was showing (see aidOf in
// simulation.js). While the game is not taking input (pause, scorecard, vote, run-end screen) presses are simply ignored.
export function applyPlayerInput(state, player, data) {
  const taking = !(state.paused || state.scorecard || state.vote || (state.runEnd && !shipOf(state, player).ctx.wreck)); // (input goes to the ship the player is aboard: its own wreck state)
  player.jx = data.jx || 0;
  player.jy = data.jy || 0;
  if (taking && data.act) {
    player.actQ = true;
    player.actAid = data.aid;
  }
  if (taking && data.grab) {
    player.grabQ = true;
    player.grabAid = data.aid;
  }
  if (taking && data.atk) player.atkQ = true;
  if (taking && data.jump) player.jumpQ = true;
  if ('thr' in data) player.thr = data.thr;
  if ('gas' in data) player.gas = data.gas;
  if (data.perfect) player.perfect = true;
  if ('vote' in data) player.vote = data.vote;
  if (data.leave) player.leaveQ = true;
  if ('fire' in data) {
    player.fire = taking && !!data.fire;
    if (data.fire) player.fireAid = data.aid; // (a hold only counts while the label it started on is still showing)
  }
  if ('prime' in data) player.prime = !!data.prime; // holding the PRIME button on a gun
  if (data.help) player.helpQ = true; // HELP! button
  if ('spot' in data) player.spotQ = { i: data.spot | 0, s: data.sq | 0 }; // tapped a radar ping
}

// A bot crewman (the recipe of the "Add 4 bot crew" button) dropping in over `ship`: along the boarding span of that ship.
export function newBot(state, ship, name) {
  const speciesNames = config.CREW_SPECIES;
  const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
  const [e0, e1] = ship.layout.boarderEntryPoints;
  const id = 'bot' + Math.random();
  return {
    id,
    bot: true,
    name,
    species: speciesNames[Math.random() * speciesNames.length | 0],
    color: colors[Math.random() * colors.length | 0],
    x: e0.x + Math.random() * (e1.x - e0.x),
    y: -60,
    fall: true,
    jx: 0,
    jy: 0,
    t: 0,
    ...(state.ships.length > 1 ? { ship: ship.id } : {}), // (with several ships in the sky a player says which one they are aboard; with one they need not)
  };
}

export function initHostNetwork({ simulation, onRoomClosed, onPlayerInput, onJoinBot }) {
  const socket = io({ transports: ['websocket'] });
  const countNode = document.getElementById('count');

  simulation.setSocket?.(socket);

  // The ship a new arrival joins: the main ship, or (with several in the sky) the one with the fewest aboard. They drop in along its boarding span.
  const joinShip = () => simulation.state.ships.reduce((best, s) => (crewOf(simulation.state, s).length < crewOf(simulation.state, best).length ? s : best), mainShip(simulation.state));
  const dropX = (ship) => { const [e0, e1] = ship.layout.boarderEntryPoints; return e0.x + Math.random() * (e1.x - e0.x); };

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
    const joined = joinShip();
    const player = simulation.state.players[m.id] || (simulation.state.players[m.id] = {
      x: dropX(joined),
      y: -60,
      fall: true,
      jx: 0,
      jy: 0,
      station: null,
      ...(simulation.state.ships.length > 1 ? { ship: joined.id } : {}),
    });
    Object.assign(player, m, { connected: true, uk: null }); // uk: null = resend button labels to the phone
    count();
  });

  socket.on('player:left', ({ id }) => {
    if (simulation.state.players[id]) simulation.state.players[id].connected = false;
  });

  socket.on('player:input', ({ id, data }) => {
    const player = simulation.state.players[id];
    if (player) applyPlayerInput(simulation.state, player, data);
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
    for (let i = 0; i < 4 && crewHeads(simulation.state) < config.MAX_PLAYERS; i++) {
      const bot = newBot(simulation.state, joinShip(), 'Bot' + (crewHeads(simulation.state) + 1));
      simulation.state.players[bot.id] = bot;
    }
    count();
  };

  return { socket, count, onPlayerInput, onJoinBot };
}
