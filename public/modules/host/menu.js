// Pause menu on the TV (Esc or P, or the Menu button on the corner badge): resume, show the join
// QR code, add/remove bots, difficulty, sound, next map, restart. While it's open the game is
// paused. It also shows the last problem the game hit (if any), to help track bugs down.
export function createMenu({ simulation, network, onPause }) {
  const el = document.getElementById('menu');
  const $ = (id) => document.getElementById(id);
  let open = false;

  const sync = () => {
    $('mDifficulty').textContent = $('difficulty').textContent;
    $('mSound').textContent = $('sound').textContent;
    $('mQr').src = $('qr').src;
    $('mCode').textContent = $('code').textContent;
    $('mUrl').textContent = $('url').textContent;
    $('mCount').textContent = $('count').textContent;
    const errs = window.gameErrors || [];
    $('mErr').textContent = errs.length ? 'Last problem (the game kept going): ' + errs[errs.length - 1] : '';
  };
  const show = (on) => {
    open = on;
    el.style.display = on ? 'flex' : 'none';
    onPause(on);
    if (on) sync();
  };
  const toggle = () => show(!open);

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') toggle();
  });
  $('menuBtn').onclick = toggle;
  $('mResume').onclick = () => show(false);
  $('mQrToggle').onclick = () => $('mJoin').classList.toggle('on');
  $('mBots').onclick = () => {
    $('bots').click();
    sync();
  };
  $('mNoBots').onclick = () => {
    for (const [id, p] of Object.entries(simulation.state.players)) if (p.bot) delete simulation.state.players[id];
    network.count();
    sync();
  };
  $('mDifficulty').onclick = () => {
    $('difficulty').click();
    sync();
  };
  $('mSound').onclick = () => {
    $('sound').click();
    sync();
  };
  $('mNext').onclick = () => {
    const c = simulation.state.course;
    if (c && simulation.course.startMission) simulation.course.startMission(c.lap + 1);
    show(false);
  };
  $('mRestart').onclick = () => {
    simulation.restart();
    show(false);
  };

  return { isOpen: () => open, toggle };
}
