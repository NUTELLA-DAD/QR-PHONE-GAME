export function createControllerUI({ network }) {
  const $ = (id) => document.getElementById(id);
  const speciesNames = [['bulldog', '🐶'], ['wolf', '🐺'], ['tiger', '🐯'], ['shiba', '🐕'], ['fox', '🦊'], ['bear', '🐻'], ['cat', '🐱'], ['rabbit', '🐰']];

  // Icon for the Action button, picked from the start of its label.
  const ACTION_ICONS = [
    ['Swap to sword', '🗡️'], ['Swap to hammer', '🔨'], ['Swap to extinguisher', '🧯'], ['Take sword', '🗡️'], ['Take hammer', '🔨'], ['Take extinguisher', '🧯'], ['Put back', '↩️'],
    ['Spray fire', '🧯'], ['Patch hole', '🔨'], ['Repair', '🔧'], ['Revive', '💫'],
    ['Close valve', '🚱'], ['Open valve', '🚰'], ['Load coal', '🔥'], ['Grab coal', '⚫'], ['Vent steam', '💨'],
    ['Patch gasbag', '🎈'], ['Load', '📦'], ['Grab ammo', '📦'],
    ['Take Helm', '☸️'], ['Take Boiler', '🔥'], ['Take', '🎯'],
    ['FIRE', '💥'], ['Ahoy', '🔭'], ['Defuse', '💣'], ['Honk', '📯'], ['Need', '❓'], ['BROKEN', '⚠️'], ['Zzz', '💤'],
  ];
  const CARRY = { sword: '🗡️ Sword', hammer: '🔨 Hammer', extinguisher: '🧯 Extinguisher', ammo: '📦 Ammo', coal: '⚫ Coal' };

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

  // Upgrade vote: show three cards; tapping one sends the vote (you can change your mind).
  const showVote = (v) => {
    const box = $('vote');
    if (!v) {
      box.style.display = 'none';
      return;
    }
    box.style.display = 'flex';
    $('vtitle').textContent = `${v.title} - ${v.t}s`;
    const cards = $('vcards');
    const sig = v.options.map((o) => o.name).join('|');
    if (cards.dataset.sig !== sig) {
      cards.dataset.sig = sig;
      cards.innerHTML = '';
      v.options.forEach((o, i) => {
        const b = document.createElement('button');
        b.innerHTML = `<span class="ic">${o.icon}</span><b>${o.name}</b><small>${o.desc}</small>`;
        b.addEventListener('pointerdown', () => {
          network.sendInput({ jx: 0, jy: 0, vote: i });
        });
        cards.appendChild(b);
      });
    }
    [...cards.children].forEach((b, i) => b.classList.toggle('on', v.mine === i));
  };

  // A short message that pops up over the controls, plus a buzz.
  let toastTimer = null;
  const showFx = (fx) => {
    if (!fx.toast) return;
    const t = $('toast');
    t.textContent = fx.toast;
    t.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.style.display = 'none'), 1800);
  };

  // Idle: a big arrow to the most useful job (the host picks it).
  const ARROWS = { left: '◀', right: '▶', up: '▲', down: '▼' };
  const showJob = (job) => {
    const on = !!(job && ARROWS[job.dir]);
    $('job').classList.toggle('show', on);
    if (!on) return;
    $('jarrow').textContent = ARROWS[job.dir];
    $('jtext').textContent = job.label;
  };

  const updateUI = (next) => {
    if (next.fx) return showFx(next.fx);
    showVote(next.vote);
    if (next.vote) return;
    uiState = next;
    showJob(next.ko || next.locked ? null : next.job);
    if (next.ko) {
      $('info').innerHTML = '<b>Knocked out!</b> Hang tight - a crewmate can revive you';
      setButton('act', '💤', 'Zzz');
      $('act').classList.remove('hold');
      $('leave').style.display = 'none';
      $('lever').style.display = 'none';
      $('plever').style.display = 'none';
      $('atk').style.display = '';
      $('jump').style.display = 'none';
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
    const ammo = next.ammo != null ? ` - ${next.ammo} ${next.kind === 'bombbay' ? 'bombs' : 'shells'}` : '';
    const hint = next.locked
      ? {
          helm: 'Stick: engines (left/right) and trim (up/down). AHEAD lever: cruise speed (STOP line = hover). PUMP/VENT lever: the gasbag - up = rise, middle = hold, down = drop.',
          gun: 'Drag to aim - it snaps onto nearby targets. Hold FIRE. Needs ammo!',
          lookout: 'Keep watch! Arrows on the TV show what is coming from off screen.',
          escort: 'You are flying the escort fighter! Point the stick where to fly - let go and she circles the ship. Her guns fire by themselves at anything in front. LEAVE flies her home.',
          coil: 'Aim with the stick, HOLD to charge the coil (uses lots of steam), let go to fire a giant bolt!',
          shield: 'Point the stick to swing the glowing shield round the ship - it blocks bullets, bats and rockets!',
          bombbay: 'Watch the red ring on the TV - press DROP when it is on a gun or building. Needs ammo crates!',
        }[next.kind]
      : next.taken
        ? 'Someone is already here'
        : next.label && next.label !== 'Hey!'
          ? next.hold ? 'Hold the Action button' : 'Tap the Action button'
          : next.carry === 'ammo'
            ? 'Bring the ammo to a gun or the Bomb Bay'
            : next.carry === 'coal'
              ? 'Bring the coal to the Boiler (main deck)'
            : 'Walk to a station, rack, fire or hole';
    const warn = next.status ? ` <span class="warn">${next.status}</span>` : '';
    $('info').innerHTML = `<b>${where}${ammo}</b> - ${hint}${warn}`;
    $('leave').style.display = next.locked ? 'block' : 'none';
    const helm = next.locked && next.kind === 'helm';
    $('lever').style.display = helm ? 'block' : 'none';
    $('plever').style.display = helm ? 'block' : 'none';
    $('atk').style.display = helm ? 'none' : '';
    $('jump').style.display = next.locked ? 'none' : ''; // no hopping while at a station
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
    network.socket.on('ui', (next) => updateUI(next));
    network.socket.on('connect', () => {
      if (joined) join();
    });
  };

  return { species, setup, join, selectSpecies, setJoinError, updateUI, getState: () => uiState };
}
