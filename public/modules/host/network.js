import { config } from '../../config.js';
import { mainShip, shipOf, crewOf } from './ships.js';
import { crewAboard, crewHeads } from './crewscale.js';
import { saveStartBuild, shipCycle } from './voyage.js';
import { pageCount } from './book.js';

// What a phone's input message does to its player (also used by tools/controls.mjs, which plays a person without a socket).
// Button presses are queued flags the simulation eats next frame; `aid` is the id of the label the phone was showing (see aidOf in
// simulation.js). While the game is not taking input (pause, scorecard, vote, run-end screen) presses are simply ignored.
export function applyPlayerInput(state, player, data) {
  const taking = !(state.paused || state.scorecard || state.vote || (state.runEnd && !shipOf(state, player).ctx.wreck)); // (input goes to the ship the player is aboard: its own wreck state)
  player.jxs = data.jx || 0; // the stick as it is on the SCREEN...
  player.jx = player.jxs * shipOf(state, player).pose.f; // ...and along the ship (she may be facing left): crew walk, guns and lamps aim, the helm steers by this one (comeAbout.js redoes it when she comes about)
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
  if (taking && ('split' in data || 'thrs' in data)) { // the helm's engine levers: SPLIT / LINK and one throttle per engine (they live on the SHIP, engines.js command)
    const ship = shipOf(state, player);
    if (player.lock && ship.layout.kindOf(player.lock) === 'helm' && ship.sim && ship.sim.engines) ship.sim.engines.command({ split: 'split' in data ? !!data.split : undefined, thrs: data.thrs, lever: data.thr });
  }
  if ('gas' in data) player.gas = data.gas;
  if (data.perfect) player.perfect = true;
  if ('vote' in data) player.vote = data.vote;
  if (data.leave) player.leaveQ = true;
  if ('fire' in data) {
    player.fire = taking && !!data.fire;
    if (data.fire) player.fireAid = data.aid; // (a hold only counts while the label it started on is still showing)
  }
  if ('ca' in data) player.ca = !!data.ca; // holding COME ABOUT (the helm's button)
  if (data.swap && state.match && state.match.on) state.match.swapTeam(player); // Versus lobby: "You're RED - tap to swap"
  if ('prime' in data) player.prime = !!data.prime; // holding the PRIME button on a gun
  if (data.help) player.helpQ = true; // HELP! button
  { const FM = config.CONTROLS.FIND_ME; if (data.find && FM.ENABLED && !player.bot && !(player.pingT > FM.TIME - FM.COOLDOWN)) player.pingT = FM.TIME; } // FIND ME button (PLAYTEST1 P2): a ring and the name on the TV; pressing again within COOLDOWN s does nothing
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
  // Showcase mode (the GitHub Pages copy, no relay server): there is no socket.io, so phones cannot join - a stand-in socket that does nothing, and bot crew only.
  const showcase = typeof io === 'undefined';
  const socket = showcase ? { on() {}, emit() {} } : io({ transports: ['websocket'] });
  const countNode = document.getElementById('count');

  if (showcase) {
    document.getElementById('qr').style.display = 'none';
    document.getElementById('code').textContent = 'DEMO';
    document.getElementById('url').innerHTML = 'Online showcase: phones join only when the game runs from start.bat.<br>Press <b>Add 4 bot crew</b>, then <b>CAST OFF!</b>';
  } else simulation.setSocket?.(socket);

  // The ship a new arrival joins: the main ship, or (with several in the sky) the one with the fewest aboard. They drop in along its boarding span.
  const joinShip = () => (simulation.match.on ? simulation.match.shipOfTeam(simulation.match.teamForJoiner()) : simulation.state.ships.filter((s) => !s.ai).reduce((best, s) => (crewOf(simulation.state, s).length < crewOf(simulation.state, best).length ? s : best), mainShip(simulation.state)));
  const dropX = (ship) => { const [e0, e1] = ship.layout.boarderEntryPoints; return e0.x + Math.random() * (e1.x - e0.x); };

  const count = () => {
    if (countNode) countNode.textContent = `${crewHeads(simulation.state)} / ${config.MAX_PLAYERS} aboard`;
  };

  socket.on('connect', () => socket.emit('host:create'));

  socket.on('host:created', async (code) => {
    const { base } = await (await fetch('api/info')).json();
    const url = `${base}/join/${code}`;
    document.getElementById('code').textContent = code;
    document.getElementById('url').textContent = base;
    document.getElementById('qr').src = 'qr?t=' + encodeURIComponent(url);
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
    if (simulation.match.on && !player.team) player.team = joined.team.id; // (Versus: the side of the ship they joined; the phone says "You're RED")
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
    const M = simulation.match;
    const lobby = simulation.state.phase === 'lobby' && !(M.on && M.phase !== 'lobby'); // (Versus: the count-in is a moored sky too, but the lobby is over)
    castButton.style.display = lobby ? '' : 'none';
    document.getElementById('join').classList.toggle('flying', !lobby);
  };
  const castOff = () => {
    simulation.castOff();
    showCastButton();
  };
  castButton.onclick = castOff;
  addEventListener('keydown', (e) => (e.key === ' ' || e.key === 'Enter') && castOff());
  // Versus lobby: C switches the rule between Broadside (sink her) and Capture (sink her, or hold her helm).
  addEventListener('keydown', (e) => {
    if ((e.key === 'c' || e.key === 'C') && simulation.match.on && simulation.match.phase === 'lobby') config.PVP.MODE = config.PVP.MODE === 'capture' ? 'broadside' : 'capture';
  });
  // Back at the mast after the ship is lost: the button comes back.
  setInterval(showCastButton, 250);

  // L2 (SHIPS_BOOK.md): host.html?christen=0 never christens (tools), ?christen=1 christens even a crew of bots (to try it alone). The Ship's Book: B or its button opens it (in the lobby, or from the pause menu),
  // Left / Right (or a click on the left / right half of the screen) turn the page, Esc or Close shuts it. While it is open it takes every key (Space must not cast off under it).
  { const q = new URLSearchParams(location.search).get('christen'); if (q === '0') simulation.state.christenMode = 'off'; else if (q === '1') simulation.state.christenMode = 'always'; }
  const bv = simulation.state.bookView, bookBtn = document.getElementById('bookBtn'), bookNav = document.getElementById('bookNav');
  const book = { onClose: null };
  const bookPages = () => pageCount(simulation.state.save); // (the cover, the crew roster page once anybody has flown (L3), a postcard for each voyage)
  const naming = () => !!(simulation.state.christen || (simulation.state.vote && simulation.state.vote.kind === 'name')); // (the name vote and the ceremony have the whole screen, like the book)
  const bookShow = () => { document.body.classList.toggle('bookopen', bv.open || naming()); if (bookNav) { bookNav.style.display = bv.open ? 'flex' : 'none'; document.getElementById('bookPage').textContent = `Page ${bv.page + 1} of ${bookPages()}`; } };
  book.open = () => { if (!config.BOOK.ENABLED) return; bv.open = true; bv.page = 0; bookShow(); };
  book.close = () => { bv.open = false; bookShow(); if (book.onClose) book.onClose(); };
  book.turn = (d) => { bv.page = Math.max(0, Math.min(bookPages() - 1, bv.page + d)); bookShow(); };
  book.isOpen = () => bv.open;
  if (bookBtn) bookBtn.onclick = book.open;
  if (bookNav) { document.getElementById('bookPrev').onclick = () => book.turn(-1); document.getElementById('bookNext').onclick = () => book.turn(1); document.getElementById('bookClose').onclick = book.close; }
  addEventListener('keydown', (e) => {
    if (bv.open) {
      if (e.key === 'ArrowLeft') book.turn(-1);
      else if (e.key === 'ArrowRight') book.turn(1);
      else if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') book.close();
      e.stopImmediatePropagation(); // (the book has the keyboard: not even the menu or CAST OFF sees it)
      e.preventDefault();
    } else if ((e.key === 'b' || e.key === 'B') && simulation.state.phase === 'lobby' && !simulation.state.vote && !simulation.state.christen && !simulation.match.on) book.open();
  }, true);
  addEventListener('pointerdown', (e) => { if (bv.open && !(e.target && e.target.closest && e.target.closest('#bookNav'))) book.turn(e.clientX < innerWidth / 2 ? -1 : 1); });
  const showBookButton = () => { if (bookBtn) bookBtn.style.display = config.BOOK.ENABLED && !simulation.match.on ? '' : 'none'; };
  showBookButton();
  setInterval(showBookButton, 500);
  setInterval(bookShow, 100);

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

  // Session length: QUICK VOYAGE / VOYAGE / EVENING CAMPAIGN (config.VOYAGE.MODES), remembered on this TV - and VERSUS (pvp/match.js), which is not remembered.
  const VERSUS_MODE = { label: 'VERSUS', blurb: 'two ships, best of 3', time: 'about 10 min' };
  const modeButton = document.getElementById('mode');
  const showMode = () => {
    const st = simulation.state;
    const M = st.mode === 'versus' ? VERSUS_MODE : config.VOYAGE.MODES[st.mode] || config.VOYAGE.MODES[config.VOYAGE.START_MODE];
    const html = 'Mode: ' + M.label + `<br><small style="font-size:12px;opacity:.75">${M.blurb}, ${M.time}</small>`;
    if (modeButton.innerHTML !== html) modeButton.innerHTML = html;
  };
  modeButton.onclick = () => {
    const keys = [...Object.keys(config.VOYAGE.MODES), 'versus']; // (VERSUS is the last: two crews, two airships, one sky)
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
  // The ship a new voyage starts with: the Sparrow (build up from a small ship at the sky-docks) or the classic full ship. Remembered on this TV; picked in the lobby it is fitted at once.
  const shipButton = document.getElementById('shipBtn');
  const showShip = () => {
    const sb = simulation.state.startBuild;
    const BC = config.VOYAGE.START_BUILD_BY_CREW;
    const NAMES = { raft: 'Raft', sparrow: 'Sparrow', classic: 'Classic' }; // (P5: the Ship button cycles Auto / Raft / Sparrow / Classic; the Sparrow and the classic are QUICK STARTS: a ship that already works)
    const small = NAMES[BC.small] || 'Sparrow';
    const html = simulation.state.startBuildAuto ? `Ship: Auto (${NAMES[simulation.pickStartBuild()] || 'Sparrow'})<br><small style="font-size:12px;opacity:.75">${small} for ${BC.max} crew or fewer, else Classic</small>` : sb === 'playtest' ? 'Ship: your build<br><small style="font-size:12px;opacity:.75">from the build page</small>' : 'Ship: ' + (NAMES[sb] || 'Sparrow') + (sb === 'raft' ? '<br><small style="font-size:12px;opacity:.75">a tiny raft: build it all, stop by stop</small>' : `<br><small style="font-size:12px;opacity:.75">QUICK START: ${sb === 'classic' ? 'the full ship from the start' : 'start small, build at the sky-docks'}</small>`);
    if (shipButton.innerHTML !== html) shipButton.innerHTML = html;
  };
  shipButton.onclick = () => {
    const next = shipCycle(simulation.state.startBuild, simulation.state.startBuildAuto); // (P5: Auto -> Raft -> Sparrow -> Classic -> Auto; the first presses force a ship, the last goes back to choosing by the crew size - F1)
    if (next.auto) simulation.setStartBuild(simulation.pickStartBuild(), 'auto');
    else simulation.setStartBuild(next.build);
    saveStartBuild(next.auto ? null : next.build);
    showShip();
  };
  setInterval(() => { showMode(); showDaily(); showShip(); }, 500); // (a finished daily voyage updates today's best)
  showShip();
  showMode();
  showDaily();

  // F3 (FUN.md) EXPERT HELM: also puts the SPLIT engine panel (a lever per engine) on the helm phone. Off by default; remembered on this TV.
  const expertButton = document.getElementById('expert');
  try { if (localStorage.getItem('airshipExpertHelm') === '1') config.CONTROLS.EXPERT = true; } catch { /* (not remembered) */ }
  const showExpert = () => {
    const html = config.CONTROLS.HELM_V2 ? (config.CONTROLS.EXPERT ? 'Helm: EXPERT<br><small style="font-size:12px;opacity:.75">stick + split engine levers</small>' : 'Helm: easy<br><small style="font-size:12px;opacity:.75">one stick, one lever</small>') : 'Helm: classic';
    if (expertButton.innerHTML !== html) expertButton.innerHTML = html;
  };
  expertButton.onclick = () => {
    config.CONTROLS.EXPERT = !config.CONTROLS.EXPERT;
    try { localStorage.setItem('airshipExpertHelm', config.CONTROLS.EXPERT ? '1' : '0'); } catch { /* (not remembered) */ }
    showExpert();
  };
  showExpert();

  document.getElementById('bots').onclick = () => {
    if (simulation.match.on) { // (Versus: two bots to each side)
      simulation.match.addBots('red', 2);
      simulation.match.addBots('blue', 2);
      count();
      return;
    }
    for (let i = 0; i < 4 && crewHeads(simulation.state) < config.MAX_PLAYERS; i++) {
      const bot = newBot(simulation.state, joinShip(), 'Bot' + (crewHeads(simulation.state) + 1));
      simulation.state.players[bot.id] = bot;
    }
    count();
  };

  return { socket, count, onPlayerInput, onJoinBot, book };
}
