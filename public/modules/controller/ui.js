export function createControllerUI({ network }) {
  const $ = (id) => document.getElementById(id);
  const speciesNames = [['bulldog', '🐶'], ['wolf', '🐺'], ['tiger', '🐯'], ['shiba', '🐕'], ['fox', '🦊'], ['bear', '🐻'], ['cat', '🐱'], ['devil', '😈']];

  // Icon for the Action button, picked from the start of its label.
  const ACTION_ICONS = [
    ['Take sword', '🗡️'], ['Take hammer', '🔨'], ['Take extinguisher', '🧯'], ['Put back', '↩️'],
    ['Spray fire', '🧯'], ['Patch hole', '🔨'], ['Repair', '🔧'], ['Revive', '💫'],
    ['Close valve', '🚱'], ['Open valve', '🚰'], ['Load', '📦'], ['Grab ammo', '📦'],
    ['Take Helm', '☸️'], ['Take Boiler', '🔥'], ['Take', '🎯'],
    ['FIRE', '💥'], ['STOKE', '🔥'], ['Honk', '📯'], ['Need', '❓'], ['BROKEN', '⚠️'], ['Zzz', '💤'],
  ];
  const CARRY = { sword: '🗡️ Sword', hammer: '🔨 Hammer', extinguisher: '🧯 Extinguisher', ammo: '📦 Ammo' };

  let species = 'bulldog';
  let joined = null;
  let uiState = {};

  const setJoinError = (message) => {
    $('err').textContent = message;
    joined = null;
  };

  // Fullscreen + landscape lock where the browser allows it (Android Chrome). Ignored elsewhere.
  const goFullscreen = () => {
    const el = document.documentElement;
    el.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
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

  const setButton = (id, icon, text) => {
    $(id).querySelector('.ic').textContent = icon;
    $(id).querySelector('.tx').textContent = text;
  };

  const updateUI = (next) => {
    uiState = next;
    if (next.ko) {
      $('info').innerHTML = '<b>Knocked out!</b> Hang tight - a crewmate can revive you';
      setButton('act', '💤', 'Zzz');
      $('act').classList.remove('hold');
      $('leave').style.display = 'none';
      $('gauge').style.display = 'none';
      navigator.vibrate?.([80, 60, 80]);
      return;
    }
    const label = next.label || 'Hey!';
    const icon = (ACTION_ICONS.find(([start]) => label.startsWith(start)) || [, '👋'])[1];
    setButton('act', icon, label);
    $('act').classList.toggle('hold', !!next.hold);
    setButton('atk', next.attack === 'Swing' ? '🗡️' : '✋', next.attack || 'Shove');

    $('carry').textContent = next.carry ? CARRY[next.carry] || next.carry : 'Hands empty';
    if (next.hull != null) {
      $('hfill').style.width = next.hull + '%';
      $('hfill').style.background = next.hull > 35 ? '#4caf50' : '#e63946';
    }

    const where = next.station || 'Walking';
    const ammo = next.ammo != null ? ` - ${next.ammo} shells` : '';
    const hint = next.locked
      ? {
          helm: 'Left/right: throttle. Up/down: altitude. Weave to dodge shots!',
          gun: 'Drag to aim (it only turns so far). Hold FIRE. Needs ammo from the hold!',
          boiler: 'Hold STOKE to shovel coal. Keep the gauge in the green!',
        }[next.kind]
      : next.taken
        ? 'Someone is already here'
        : next.label && next.label !== 'Hey!'
          ? next.hold ? 'Hold the Action button' : 'Tap the Action button'
          : next.carry === 'ammo'
            ? 'Bring the ammo to a gun'
            : 'Walk to a station, rack, fire or hole';
    const warn = next.status ? ` <span class="warn">${next.status}</span>` : '';
    $('info').innerHTML = `<b>${where}${ammo}</b> - ${hint}${warn}`;
    $('leave').style.display = next.locked ? 'block' : 'none';
    $('gauge').style.display = next.locked && next.kind === 'boiler' ? 'block' : 'none';
    navigator.vibrate?.(20);
  };

  const setup = () => {
    $('code').value = (new URLSearchParams(location.search).get('code') || '').toUpperCase();
    $('name').value = localStorage.name || '';
    $('lefty').checked = localStorage.lefty === '1';
    document.body.classList.toggle('lefty', $('lefty').checked);
    $('lefty').onchange = () => {
      localStorage.lefty = $('lefty').checked ? '1' : '0';
      document.body.classList.toggle('lefty', $('lefty').checked);
    };
    renderSpeciesButtons();
    $('go').onclick = () => {
      goFullscreen();
      join();
    };
    $('leave').onclick = () => network.sendInput({ jx: 0, jy: 0, leave: 1 });
    network.socket.on('join:error', (message) => setJoinError(message));
    network.socket.on('join:ok', (message) => {
      localStorage['tok' + message.code] = message.token;
      document.body.classList.add('play');
      document.body.style.setProperty('--c', message.color);
      $('myname').textContent = message.name;
      $('vjoin').classList.remove('show');
      $('vplay').classList.add('show');
      navigator.wakeLock?.request('screen').catch(() => {});
    });
    network.socket.on('room:closed', () => location.reload());
    network.socket.on('ui', (next) => {
      if (next.tick) {
        const gfill = $('gfill');
        gfill.style.width = next.pressure + '%';
        gfill.style.background = next.pressure >= 40 && next.pressure <= 80 ? '#4caf50' : '#e63946';
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
