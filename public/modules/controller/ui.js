export function createControllerUI({ network }) {
  const $ = (id) => document.getElementById(id);
  const speciesNames = [['bulldog', '🐶'], ['wolf', '🐺'], ['tiger', '🐯'], ['shiba', '🐕'], ['fox', '🦊'], ['bear', '🐻'], ['cat', '🐱'], ['devil', '😈']];

  let species = 'bulldog';
  let joined = null;
  let uiState = {};

  const setJoinError = (message) => {
    $('err').textContent = message;
    joined = null;
  };

  const join = () => {
    const code = $('code').value.trim().toUpperCase();
    const name = $('name').value.trim() || 'Crew';
    localStorage.name = name;
    joined = { code, name, species };
    network.join({ code, name, species });
  };

  const selectSpecies = (value) => {
    species = value;
    [...$('species').children].forEach((child) => child.classList.toggle('on', child.dataset.species === value));
  };

  const renderSpeciesButtons = () => {
    speciesNames.forEach(([key, emoji]) => {
      const button = document.createElement('button');
      button.dataset.species = key;
      button.textContent = emoji;
      button.onclick = () => selectSpecies(key);
      if (key === species) button.classList.add('on');
      $('species').appendChild(button);
    });
  };

  const updateUI = (next) => {
    uiState = next;
    if (next.ko) {
      $('station').innerHTML = 'Knocked out!<small>Hang tight - a crewmate can revive you</small>';
      $('act').textContent = 'Zzz';
      $('leave').style.display = 'none';
      $('gauge').style.display = 'none';
      navigator.vibrate?.([80, 60, 80]);
      return;
    }
    const station = next.station || 'Walking';
    const ammo = next.ammo != null ? ' - ' + next.ammo + ' shells' : '';
    const action = next.label && next.label !== 'Hey!' ? next.label + (next.hold ? ' - hold the button' : ' - tap the button') : '';
    const hint = next.locked ? {
      helm: 'Left/right: throttle. Up/down: altitude. Keep moving to dodge shots!',
      gun: 'Drag to aim. Hold FIRE to shoot. Needs ammo from the hold!',
      boiler: 'Hold STOKE to shovel coal. Keep the gauge in the green!'
    }[next.kind] : action || (next.taken ? 'Someone is already here' : next.carry === 'ammo' ? 'Bring the ammo to a cannon' : next.carry ? 'Find a hole to patch' : station === 'Walking' ? 'Walk to a station, hole, or fire' : 'Nothing to do here yet');
    $('station').innerHTML = `${station}${ammo}${next.carry ? ' (carrying ' + next.carry + ')' : ''}<small>${hint}</small>`;
    $('act').textContent = next.label || 'Hey!';
    $('leave').style.display = next.locked ? 'block' : 'none';
    $('gauge').style.display = next.locked && next.kind === 'boiler' ? 'block' : 'none';
    navigator.vibrate?.(30);
  };

  const setup = () => {
    $('code').value = (new URLSearchParams(location.search).get('code') || '').toUpperCase();
    $('name').value = localStorage.name || '';
    renderSpeciesButtons();
    $('go').onclick = join;
    $('leave').onclick = () => network.sendInput({ jx: 0, jy: 0, leave: 1 });
    network.socket.on('join:error', (message) => setJoinError(message));
    network.socket.on('join:ok', (message) => {
      localStorage['tok' + message.code] = message.token;
      document.body.classList.add('play');
      document.body.style.setProperty('--c', message.color);
      $('vjoin').classList.remove('show');
      $('vplay').classList.add('show');
      navigator.wakeLock?.request('screen').catch(() => {});
    });
    network.socket.on('room:closed', () => location.reload());
    network.socket.on('ui', (next) => {
      if (next.tick) {
        const gfill = $('gfill');
        gfill.style.width = next.pressure + '%';
        gfill.style.background = (next.pressure >= 40 && next.pressure <= 80) ? '#4caf50' : '#e63946';
        return;
      }
      updateUI(next);
    });
    network.socket.on('connect', () => {
      if (joined) join();
    });
  };

  return { species, setup, join, selectSpecies, setJoinError, updateUI, getState: () => uiState };
}
