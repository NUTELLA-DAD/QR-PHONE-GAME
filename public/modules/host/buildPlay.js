// The build page's big-screen shell and playtest (buildtest.html): everything around the blueprint that is not editing.
//   * UI SIZE: the whole page is scaled (CSS zoom) from the screen size - 1080p is 100%, 4K is 200% - or by the "UI size" choice (remembered); `ui.scale` is what the canvases draw with.
//   * Folding side panels (the parts tray, the report), the View buttons (Blueprint / Split / Live) with a draggable divider, the zoom buttons (the wheel, pan and pinch are buildView.js).
//   * PLAYTEST (co-op) / PLAYTEST (Versus): the build goes to the real host game (playtest.js). A build the validator FAILs cannot fly, so the button says why instead; warnings are shown and allowed.
//   * My Ships: named designs (save, load, rename, delete) and the autosaved working build.
// buildTest.js calls initBuildUi(api) once; api = { view, bp, scene, parts(), result(), layout(), load(parts, text), note(text, bad), setEditing(bool), onUi() }.
import { config } from '../../config.js';
import { buildShelf } from './pvp/shelf.js';
import { saveWorking, playtestUrl, listDesigns, saveDesign, renameDesign, deleteDesign, getDesign } from './playtest.js';

export const ui = { scale: 1 }; // the page's zoom (buildTest.js multiplies its canvas pixel ratio by it)

const $ = (id) => document.getElementById(id);
const BV = () => config.BUILD_VIEW;
const PREF = 'airshipBuildUi';
const get = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
const put = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* (not remembered) */ } };

export function initBuildUi(api) {
  const { view, bp } = api;

  // ---- UI size ---------------------------------------------------------------------------------------------------------------
  const sel = $('uiSize');
  for (const v of ['auto', ...BV().UI_STEPS]) { const o = document.createElement('option'); o.value = String(v); o.textContent = v === 'auto' ? 'Auto' : Math.round(v * 100) + '%'; sel.appendChild(o); }
  sel.value = get(PREF, 'auto');
  if (![...sel.options].some((o) => o.value === sel.value)) sel.value = 'auto';
  const autoScale = () => Math.max(1, Math.min(BV().UI_MAX, Math.round(Math.min(innerWidth / 1920, innerHeight / 1080) * 20) / 20)); // (nothing below 1: small screens keep the old size)
  function applyUi() {
    const s = sel.value === 'auto' ? autoScale() : Number(sel.value);
    ui.scale = s;
    const app = $('app');
    app.style.zoom = String(s);
    app.style.width = Math.floor(innerWidth / s) + 'px';
    app.style.height = Math.floor(innerHeight / s) + 'px';
    api.onUi();
  }
  sel.onchange = () => { put(PREF, sel.value); applyUi(); };
  addEventListener('resize', applyUi);

  // ---- folding panels ----------------------------------------------------------------------------------------------------------
  for (const [panel, btn, open, shut] of [['left', 'foldLeft', '«', '»'], ['right', 'foldRight', '»', '«']]) {
    const el = $(panel), b = $(btn);
    const set = (shutNow) => { el.classList.toggle('collapsed', shutNow); b.innerHTML = shutNow ? shut : open; put('airshipBuildFold_' + panel, shutNow ? 1 : 0); api.onUi(); };
    b.onclick = () => set(!el.classList.contains('collapsed'));
    if (get('airshipBuildFold_' + panel, innerWidth < 1500 ? '1' : '0') === '1') set(true); // (a small screen starts with both side panels folded: the paper first)
  }

  // ---- views: Blueprint / Split / Live ----------------------------------------------------------------------------------------
  let mode = get('airshipBuildView', BV().VIEW);
  let frac = Number(get('airshipBuildSplit', BV().SPLIT)) || BV().SPLIT;
  const centre = $('centre');
  function setView(m) {
    mode = m;
    put('airshipBuildView', m);
    centre.classList.remove('vm-bp', 'vm-split', 'vm-live');
    centre.classList.add('vm-' + m);
    for (const [id, name] of [['vmBp', 'bp'], ['vmSplit', 'split'], ['vmLive', 'live']]) $(id).className = mode === name ? 'on' : '';
    bp.style.flex = `${frac} 1 0`;
    api.scene.style.flex = `${1 - frac} 1 0`;
    api.setEditing(m !== 'live');
  }
  $('vmBp').onclick = () => setView('bp');
  $('vmSplit').onclick = () => setView('split');
  $('vmLive').onclick = () => setView('live');
  const split = $('split');
  let dragging = false;
  split.addEventListener('pointerdown', (e) => { dragging = true; split.setPointerCapture(e.pointerId); e.preventDefault(); });
  split.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const a = bp.getBoundingClientRect(), b = api.scene.getBoundingClientRect(), top = a.top, bottom = b.bottom;
    frac = Math.max(BV().SIDE_MIN, Math.min(BV().SIDE_MAX, (e.clientY - top) / Math.max(1, bottom - top)));
    bp.style.flex = `${frac} 1 0`;
    api.scene.style.flex = `${1 - frac} 1 0`;
  });
  const endDrag = () => { if (dragging) { dragging = false; put('airshipBuildSplit', frac.toFixed(3)); } };
  split.addEventListener('pointerup', endDrag);
  split.addEventListener('pointercancel', endDrag);

  // ---- zoom buttons ------------------------------------------------------------------------------------------------------------
  const mid = () => [bp.width / 2, bp.height / 2];
  $('zIn').onclick = () => view.zoomAt(...mid(), BV().ZOOM_STEP);
  $('zOut').onclick = () => view.zoomAt(...mid(), 1 / BV().ZOOM_STEP);
  $('zFit').onclick = () => view.fit(api.layout());
  $('zReset').onclick = () => view.reset();

  // ---- playtest ------------------------------------------------------------------------------------------------------------------
  for (const n of config.PLAYTEST.CREW) { const o = document.createElement('option'); o.value = String(n); o.textContent = n ? n + ' bots' : 'Phones only'; $('ptCrew').appendChild(o); }
  $('ptCrew').value = get('airshipPlaytestCrew', String(config.PLAYTEST.CREW_DEFAULT));
  $('ptCrew').onchange = () => put('airshipPlaytestCrew', $('ptCrew').value);
  const foe = $('ptFoe');
  setTimeout(() => { // (the shelf validates a dozen ships: after the first frame)
    try { for (const e of buildShelf()) if (e.id !== config.PLAYTEST.SHIP_ID) { const o = document.createElement('option'); o.value = e.id; o.textContent = e.random ? `${e.name} (a random ship)` : `${e.name} (weight ${e.mass})`; foe.appendChild(o); } } catch (e) { console.warn('shelf', e); }
    foe.value = get('airshipPlaytestFoe', config.PLAYTEST.FOE_DEFAULT);
    if (!foe.value && foe.options.length) foe.selectedIndex = 0;
  }, 60);
  foe.onchange = () => put('airshipPlaytestFoe', foe.value);
  const msg = (text, cls = '') => { $('ptMsg').textContent = text; $('ptMsg').className = cls; };
  const fliesText = () => {
    const r = api.result();
    if (!r) return ['', ''];
    if (!r.ok) return ['CANNOT FLY yet - ' + (r.needs.length ? 'needs: ' + r.needs.slice(0, 4).join(', ') : r.fails[0]) + '. A playtest flies the ship in the real game, so it has to be able to fly first.', 'bad'];
    if (r.warns.length) return [`She can fly, with ${r.warns.length} warning${r.warns.length === 1 ? '' : 's'}: ${r.warns[0]}${r.warns.length > 1 ? ' (+' + (r.warns.length - 1) + ' more)' : ''}. Playtest anyway.`, 'warn'];
    return ['She can fly. Playtest opens the real game with this exact ship.', ''];
  };
  let shown = '';
  function refreshed() { // (after every edit)
    const [text, cls] = fliesText();
    const key = text + cls;
    if (key !== shown) { shown = key; msg(text, cls); }
    const ok = api.result() && api.result().ok;
    $('ptCoop').classList.toggle('blocked', !ok);
    $('ptVs').classList.toggle('blocked', !ok);
  }
  function launch(modeName) {
    const r = api.result();
    if (!r || !r.ok) { const [text] = fliesText(); msg(text, 'bad'); api.note(text, true); return null; }
    const parts = api.parts(), name = $('msName').value.trim() || 'My Ship';
    saveWorking(parts);
    const job = { parts, name, mode: modeName, foe: foe.value || config.PLAYTEST.FOE_DEFAULT, bots: Number($('ptCrew').value) || 0 };
    const url = playtestUrl(job);
    msg('Opening the game' + (modeName === 'versus' ? ' (Versus vs ' + job.foe + ')' : '') + '...', '');
    if (!api.noNavigate) location.href = url;
    return url;
  }
  $('ptCoop').onclick = () => launch('coop');
  $('ptVs').onclick = () => launch('versus');

  // ---- My Ships ------------------------------------------------------------------------------------------------------------------
  let cur = null; // the id of the design last saved or loaded
  const note = (t, bad) => { $('msNote').textContent = t; $('msNote').className = bad ? 'bad' : ''; };
  function renderShips() {
    const ul = $('msList');
    ul.textContent = '';
    const list = listDesigns();
    if (!list.length) { const li = document.createElement('li'); li.textContent = 'Nothing saved yet.'; li.style.color = 'var(--soft)'; ul.appendChild(li); }
    for (const d of list) {
      const li = document.createElement('li');
      li.className = d.id === cur ? 'cur' : '';
      const name = document.createElement('input');
      name.value = d.name;
      name.maxLength = config.PLAYTEST.NAME_MAX;
      name.title = 'Click to rename: type, then Enter';
      name.onchange = () => { const r = renameDesign(d.id, name.value); note(r.hint, !r.ok); if (r.ok && d.id === cur) $('msName').value = r.design.name; renderShips(); };
      name.onkeydown = (e) => { if (e.key === 'Enter') name.blur(); e.stopPropagation(); };
      const info = document.createElement('small');
      info.textContent = d.parts.length + ' parts';
      const load = document.createElement('button');
      load.textContent = 'Load';
      load.title = 'Put this ship on the blueprint (Undo brings back what was there)';
      load.onclick = () => { const e = getDesign(d.id); if (!e) return; cur = e.id; $('msName').value = e.name; api.load(e.parts.map((p) => ({ ...p })), 'Loaded "' + e.name + '" from My Ships.'); renderShips(); };
      const del = document.createElement('button');
      del.textContent = 'Delete';
      let armed = 0;
      del.onclick = () => {
        if (!armed) { armed = setTimeout(() => { armed = 0; del.textContent = 'Delete'; }, 2500); del.textContent = 'Sure?'; return; }
        clearTimeout(armed);
        const r = deleteDesign(d.id);
        if (cur === d.id) cur = null;
        note(r.hint, !r.ok);
        renderShips();
      };
      li.append(name, info, load, del);
      ul.appendChild(li);
    }
  }
  $('msSave').onclick = () => {
    const r = saveDesign($('msName').value, api.parts());
    note(r.hint, !r.ok);
    if (r.ok) cur = r.design.id;
    renderShips();
  };
  $('msName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('msSave').click(); e.stopPropagation(); });
  renderShips();

  // ---- autosave of the working build, and the frame tick ------------------------------------------------------------------------------
  let saveT = 0;
  function edited() { clearTimeout(saveT); saveT = setTimeout(() => { saveT = 0; saveWorking(api.parts()); }, BV().WORKING_DEBOUNCE); refreshed(); }
  addEventListener('pagehide', () => { if (saveT) { clearTimeout(saveT); saveT = 0; saveWorking(api.parts()); } }); // (closing or leaving within the debounce: nothing is lost)
  let lastZ = '';
  function update() { const t = Math.round(view.z * 100) + '%'; if (t !== lastZ) { lastZ = t; $('zLbl').textContent = t; } }

  applyUi();
  setView(mode);
  return { edited, update, refreshed, setView, applyUi, launch, renderShips, mode: () => mode, cur: () => cur, hint: msg };
}
