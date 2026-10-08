// Pause menu on the TV (Esc or P, or the Menu button on the corner badge): resume, show the join
// QR code, add/remove bots, difficulty, sound, next map, restart. While it's open the game is
// paused. It also shows the last problem the game hit (if any), to help track bugs down.
import { config } from '../../config.js';
export function createMenu({ simulation, network, onPause, perf, music }) {
  const el = document.getElementById('menu');
  const $ = (id) => document.getElementById(id);
  let open = false;

  const sync = () => {
    $('mDifficulty').innerHTML = $('difficulty').innerHTML;
    $('mMode').innerHTML = $('mode').innerHTML;
    $('mDaily').innerHTML = $('daily').innerHTML;
    $('mShip').innerHTML = $('shipBtn').innerHTML;
    $('mSound').textContent = $('sound').textContent;
    $('mMusic').textContent = music && music.isOn() ? 'Music: on' : 'Music: off';
    $('mQr').src = $('qr').src;
    $('mCode').textContent = $('code').textContent;
    $('mUrl').textContent = $('url').textContent;
    $('mCount').textContent = $('count').textContent;
    if (perf) $('mDetail').textContent = perf.label();
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
  $('mArt').onclick = () => window.open('/styletest.html', '_blank'); // art style test page (new tab, the game stays paused)
  $('mBuild').onclick = () => window.open('/buildtest.html', '_blank'); // ship building test page: parts, validator, gauges (new tab)
  $('mResume').onclick = () => show(false);
  $('mQrToggle').onclick = () => $('mJoin').classList.toggle('on');
  $('mBots').onclick = () => {
    $('bots').click();
    sync();
  };
  $('mNoBots').onclick = () => {
    for (const [id, p] of Object.entries(simulation.state.players)) if (p.bot && !p.mate) delete simulation.state.players[id];
    network.count();
    sync();
  };
  $('mDifficulty').onclick = () => {
    $('difficulty').click();
    sync();
  };
  // Session mode and daily voyage (they apply to the next voyage; a voyage in flight carries on as it is).
  $('mMode').onclick = () => {
    $('mode').click();
    sync();
  };
  $('mDaily').onclick = () => {
    $('daily').click();
    sync();
  };
  $('mShip').onclick = () => { // (the Sparrow or the classic ship: fitted at once in the lobby, otherwise for the next voyage)
    $('shipBtn').click();
    sync();
  };
  // Screen: Smooth (fast) or Sharp (crisper on high-resolution screens, slower).
  const sharpLabel = () => ($('mSharp').textContent = config.DISPLAY.MAX_PIXEL_RATIO > 1 ? 'Screen: Sharp' : 'Screen: Smooth (fast)');
  sharpLabel();
  $('mSharp').onclick = () => {
    const sharp = !(config.DISPLAY.MAX_PIXEL_RATIO > 1);
    config.DISPLAY.MAX_PIXEL_RATIO = sharp ? config.DISPLAY.SHARP_RATIO : 1;
    try { localStorage.setItem('airshipSharp', sharp ? '1' : '0'); } catch { /* (not remembered) */ }
    if (window.fitCanvas) window.fitCanvas();
    sharpLabel();
  };
  // Detail: Auto (the game lowers/raises detail by itself, shows the current level) / High / Medium / Low.
  const detailLabel = () => {
    if (perf) $('mDetail').textContent = perf.label();
  };
  detailLabel();
  $('mDetail').onclick = () => {
    if (!perf) return;
    perf.cycleMode();
    detailLabel();
  };
  $('mSound').onclick = () => {
    $('sound').click();
    sync();
  };
  $('mMusic').onclick = () => {
    if (music) music.toggle();
    sync();
  };
  $('mNext').onclick = () => {
    if (simulation.match.on) return show(false); // (Versus has no maps to skip: the arena is one sky per round)
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
